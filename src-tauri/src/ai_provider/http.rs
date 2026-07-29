use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Once;
use std::time::Duration;

use futures_util::StreamExt;
use reqwest::{header, Method, StatusCode};
use serde_json::Value;
use url::Url;
use zeroize::Zeroizing;

use super::AiProviderError;

pub(crate) const MAX_EVENT_BYTES: usize = 256 * 1024;
pub(crate) const MAX_RESPONSE_BYTES: usize = 8 * 1024 * 1024;
pub(crate) const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
pub(crate) const STREAM_IDLE_TIMEOUT: Duration = Duration::from_secs(15);
pub(crate) const TURN_TIMEOUT: Duration = Duration::from_secs(90);

pub(crate) enum AuthHeader {
    Bearer(Zeroizing<String>),
    Anthropic(Zeroizing<String>),
    None,
}

pub(crate) struct SseEvent {
    pub(crate) data: String,
}

pub(crate) struct ControlledHttpClient {
    client: reqwest::Client,
}

impl ControlledHttpClient {
    pub(crate) fn new() -> Result<Self, AiProviderError> {
        install_rustls_provider();
        let client = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .connect_timeout(CONNECT_TIMEOUT)
            .user_agent(concat!("CONTAM-Studio/", env!("CARGO_PKG_VERSION")))
            .build()
            .map_err(|_| AiProviderError::new("ai_provider_connection_failed"))?;
        Ok(Self { client })
    }

    pub(crate) async fn get_json(
        &self,
        url: &Url,
        auth: AuthHeader,
    ) -> Result<Value, AiProviderError> {
        let response = self.send(Method::GET, url, auth, None).await?;
        let bytes = read_body_limited(response, MAX_RESPONSE_BYTES).await?;
        serde_json::from_slice(&bytes)
            .map_err(|_| AiProviderError::new("ai_provider_response_invalid"))
    }

    pub(crate) async fn post_sse(
        &self,
        url: &Url,
        auth: AuthHeader,
        body: Value,
        cancel: &AtomicBool,
    ) -> Result<Vec<SseEvent>, AiProviderError> {
        let response = self.send(Method::POST, url, auth, Some(body)).await?;
        let mut stream = response.bytes_stream();
        let mut decoder = SseDecoder::default();
        loop {
            if cancel.load(Ordering::Acquire) {
                return Err(AiProviderError::new("ai_provider_cancelled"));
            }
            let next = tokio::time::timeout(STREAM_IDLE_TIMEOUT, stream.next())
                .await
                .map_err(|_| AiProviderError::new("ai_provider_timeout"))?;
            let Some(chunk) = next else {
                break;
            };
            let chunk = chunk.map_err(|_| AiProviderError::new("ai_provider_stream_invalid"))?;
            decoder.push(&chunk)?;
        }
        decoder.finish()
    }

    async fn send(
        &self,
        method: Method,
        url: &Url,
        auth: AuthHeader,
        body: Option<Value>,
    ) -> Result<reqwest::Response, AiProviderError> {
        let mut request = self.client.request(method, url.clone());
        request = request.header(header::ACCEPT, "text/event-stream, application/json");
        if let Some(body) = body {
            request = request.json(&body);
        }
        match auth {
            AuthHeader::Bearer(secret) => {
                request = request.bearer_auth(secret.as_str());
            }
            AuthHeader::Anthropic(secret) => {
                request = request.header("x-api-key", secret.as_str());
                request = request.header("anthropic-version", "2023-06-01");
            }
            AuthHeader::None => {}
        }
        let response = request
            .send()
            .await
            .map_err(|error| map_reqwest_error(&error))?;
        if response.status().is_redirection() {
            return Err(AiProviderError::new("ai_provider_endpoint_rejected"));
        }
        if !response.status().is_success() {
            return Err(map_status(response.status()));
        }
        Ok(response)
    }
}

fn install_rustls_provider() {
    static INSTALL_PROVIDER: Once = Once::new();
    INSTALL_PROVIDER.call_once(|| {
        if rustls::crypto::CryptoProvider::get_default().is_none() {
            let _ = rustls::crypto::ring::default_provider().install_default();
        }
    });
}

fn map_reqwest_error(error: &reqwest::Error) -> AiProviderError {
    if error.is_timeout() {
        AiProviderError::new("ai_provider_timeout")
    } else if error.is_connect() {
        AiProviderError::new("ai_provider_connection_failed")
    } else {
        AiProviderError::new("ai_provider_unavailable")
    }
}

fn map_status(status: StatusCode) -> AiProviderError {
    match status {
        StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN => {
            AiProviderError::new("ai_provider_auth_failed")
        }
        StatusCode::TOO_MANY_REQUESTS => AiProviderError::new("ai_provider_rate_limited"),
        status if status.is_server_error() => AiProviderError::new("ai_provider_unavailable"),
        StatusCode::NOT_FOUND => AiProviderError::new("ai_provider_model_catalog_failed"),
        _ => AiProviderError::new("ai_provider_connection_failed"),
    }
}

async fn read_body_limited(
    response: reqwest::Response,
    maximum: usize,
) -> Result<Vec<u8>, AiProviderError> {
    let mut stream = response.bytes_stream();
    let mut bytes = Vec::new();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|_| AiProviderError::new("ai_provider_stream_invalid"))?;
        if bytes.len().saturating_add(chunk.len()) > maximum {
            return Err(AiProviderError::new("ai_provider_response_invalid"));
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(bytes)
}

#[derive(Default)]
pub(crate) struct SseDecoder {
    buffer: Vec<u8>,
    data_lines: Vec<String>,
    event_bytes: usize,
    total_bytes: usize,
    events: Vec<SseEvent>,
}

impl SseDecoder {
    pub(crate) fn push(&mut self, bytes: &[u8]) -> Result<(), AiProviderError> {
        self.total_bytes = self
            .total_bytes
            .checked_add(bytes.len())
            .ok_or_else(|| AiProviderError::new("ai_provider_stream_invalid"))?;
        if self.total_bytes > MAX_RESPONSE_BYTES {
            return Err(AiProviderError::new("ai_provider_stream_invalid"));
        }
        self.buffer.extend_from_slice(bytes);
        while let Some(position) = self.buffer.iter().position(|byte| *byte == b'\n') {
            let mut line = self.buffer.drain(..=position).collect::<Vec<_>>();
            line.pop();
            if line.last() == Some(&b'\r') {
                line.pop();
            }
            self.process_line(&line)?;
        }
        if self.buffer.len() > MAX_EVENT_BYTES {
            return Err(AiProviderError::new("ai_provider_stream_invalid"));
        }
        Ok(())
    }

    pub(crate) fn finish(mut self) -> Result<Vec<SseEvent>, AiProviderError> {
        if !self.buffer.is_empty() {
            let line = std::mem::take(&mut self.buffer);
            self.process_line(&line)?;
        }
        self.commit_event();
        Ok(self.events)
    }

    fn process_line(&mut self, line: &[u8]) -> Result<(), AiProviderError> {
        if line.len() > MAX_EVENT_BYTES {
            return Err(AiProviderError::new("ai_provider_stream_invalid"));
        }
        if line.is_empty() {
            self.commit_event();
            return Ok(());
        }
        if line[0] == b':' {
            return Ok(());
        }
        if line.starts_with(b"data:") {
            let value = std::str::from_utf8(&line[5..])
                .map_err(|_| AiProviderError::new("ai_provider_stream_invalid"))?;
            let value = value.strip_prefix(' ').unwrap_or(value);
            self.event_bytes = self
                .event_bytes
                .checked_add(value.len())
                .ok_or_else(|| AiProviderError::new("ai_provider_stream_invalid"))?;
            if self.event_bytes > MAX_EVENT_BYTES {
                return Err(AiProviderError::new("ai_provider_stream_invalid"));
            }
            self.data_lines.push(value.to_owned());
        }
        Ok(())
    }

    fn commit_event(&mut self) {
        if self.data_lines.is_empty() {
            self.event_bytes = 0;
            return;
        }
        let data = self.data_lines.join("\n");
        self.data_lines.clear();
        self.event_bytes = 0;
        self.events.push(SseEvent { data });
    }
}

pub(crate) fn endpoint_url(base: &Url, endpoint: &str) -> Result<Url, AiProviderError> {
    base.join(endpoint)
        .map_err(|_| AiProviderError::new("ai_provider_endpoint_rejected"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sse_decoder_handles_split_crlf_comments_and_multiline_data() {
        let mut decoder = SseDecoder::default();
        decoder.push(b": keep-alive\r\ndata: {\"a\":\n").unwrap();
        decoder.push(b"data: 1}\r\n\r\n").unwrap();
        let events = decoder.finish().unwrap();
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].data, "{\"a\":\n1}");
    }

    #[test]
    fn sse_decoder_rejects_invalid_utf8_and_oversized_event() {
        let mut invalid = SseDecoder::default();
        invalid.push(b"data: \xff\n").unwrap_err();
        let mut oversized = SseDecoder::default();
        oversized
            .push(format!("data: {}\n", "x".repeat(MAX_EVENT_BYTES)).as_bytes())
            .unwrap_err();
    }

    #[test]
    fn endpoint_join_preserves_base_path_prefix() {
        let base = Url::parse("https://example.test/v1/").unwrap();
        assert_eq!(
            endpoint_url(&base, "models").unwrap().as_str(),
            "https://example.test/v1/models"
        );
    }
}
