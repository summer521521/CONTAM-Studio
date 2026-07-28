#[cfg(test)]
use std::collections::HashMap;
use std::sync::Mutex;

use uuid::Uuid;
use zeroize::Zeroizing;

pub const CREDENTIAL_SERVICE: &str = "org.contamstudio.ai-provider";

#[derive(Clone)]
pub struct SecretInput(Zeroizing<String>);

impl SecretInput {
    pub fn new(value: String) -> Self {
        Self(Zeroizing::new(value))
    }

    pub fn as_str(&self) -> &str {
        self.0.as_str()
    }
}

pub struct SecretValue(Zeroizing<String>);

impl SecretValue {
    #[cfg(test)]
    pub fn as_str(&self) -> &str {
        self.0.as_str()
    }

    pub(crate) fn into_zeroizing(self) -> Zeroizing<String> {
        self.0
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CredentialError {
    Unavailable,
    WriteFailed,
    DeleteFailed,
}

pub trait AiCredentialStore: Send + Sync {
    fn set(&self, profile_id: Uuid, secret: SecretInput) -> Result<(), CredentialError>;
    fn get(&self, profile_id: Uuid) -> Result<Option<SecretValue>, CredentialError>;
    fn delete(&self, profile_id: Uuid) -> Result<(), CredentialError>;
}

/// Production credential storage. On Windows this maps to Windows Credential
/// Manager through keyring. Other platforms deliberately report unavailable;
/// the product is Windows-first and must never create a plaintext fallback.
pub struct SystemCredentialStore {
    operation_gate: Mutex<()>,
}

impl Default for SystemCredentialStore {
    fn default() -> Self {
        Self {
            operation_gate: Mutex::new(()),
        }
    }
}

impl SystemCredentialStore {
    fn username(profile_id: Uuid) -> String {
        format!("profile:{profile_id}")
    }
}

#[cfg(target_os = "windows")]
impl AiCredentialStore for SystemCredentialStore {
    fn set(&self, profile_id: Uuid, secret: SecretInput) -> Result<(), CredentialError> {
        let _gate = self
            .operation_gate
            .lock()
            .map_err(|_| CredentialError::Unavailable)?;
        let entry = keyring::Entry::new(CREDENTIAL_SERVICE, &Self::username(profile_id))
            .map_err(|_| CredentialError::Unavailable)?;
        entry
            .set_password(secret.as_str())
            .map_err(|_| CredentialError::WriteFailed)
    }

    fn get(&self, profile_id: Uuid) -> Result<Option<SecretValue>, CredentialError> {
        let _gate = self
            .operation_gate
            .lock()
            .map_err(|_| CredentialError::Unavailable)?;
        let entry = keyring::Entry::new(CREDENTIAL_SERVICE, &Self::username(profile_id))
            .map_err(|_| CredentialError::Unavailable)?;
        match entry.get_password() {
            Ok(value) => Ok(Some(SecretValue(Zeroizing::new(value)))),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(_) => Err(CredentialError::Unavailable),
        }
    }

    fn delete(&self, profile_id: Uuid) -> Result<(), CredentialError> {
        let _gate = self
            .operation_gate
            .lock()
            .map_err(|_| CredentialError::Unavailable)?;
        let entry = keyring::Entry::new(CREDENTIAL_SERVICE, &Self::username(profile_id))
            .map_err(|_| CredentialError::Unavailable)?;
        match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(_) => Err(CredentialError::DeleteFailed),
        }
    }
}

#[cfg(not(target_os = "windows"))]
impl AiCredentialStore for SystemCredentialStore {
    fn set(&self, _profile_id: Uuid, _secret: SecretInput) -> Result<(), CredentialError> {
        Err(CredentialError::Unavailable)
    }

    fn get(&self, _profile_id: Uuid) -> Result<Option<SecretValue>, CredentialError> {
        Err(CredentialError::Unavailable)
    }

    fn delete(&self, _profile_id: Uuid) -> Result<(), CredentialError> {
        Err(CredentialError::Unavailable)
    }
}

/// In-memory fake used by Rust tests. It intentionally has the same API shape
/// as the production store while never touching the host credential manager.
#[cfg(test)]
#[derive(Default)]
pub struct MemoryCredentialStore {
    values: Mutex<HashMap<Uuid, String>>,
}

#[cfg(test)]
impl AiCredentialStore for MemoryCredentialStore {
    fn set(&self, profile_id: Uuid, secret: SecretInput) -> Result<(), CredentialError> {
        self.values
            .lock()
            .map_err(|_| CredentialError::Unavailable)?
            .insert(profile_id, secret.as_str().to_owned());
        Ok(())
    }

    fn get(&self, profile_id: Uuid) -> Result<Option<SecretValue>, CredentialError> {
        Ok(self
            .values
            .lock()
            .map_err(|_| CredentialError::Unavailable)?
            .get(&profile_id)
            .cloned()
            .map(|value| SecretValue(Zeroizing::new(value))))
    }

    fn delete(&self, profile_id: Uuid) -> Result<(), CredentialError> {
        self.values
            .lock()
            .map_err(|_| CredentialError::Unavailable)?
            .remove(&profile_id);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn memory_store_round_trip_does_not_serialize_secret() {
        let store = MemoryCredentialStore::default();
        let id = Uuid::new_v4();
        store
            .set(
                id,
                SecretInput::new("test-secret-must-never-escape".to_owned()),
            )
            .unwrap();
        assert_eq!(
            store.get(id).unwrap().as_ref().map(SecretValue::as_str),
            Some("test-secret-must-never-escape")
        );
        store.delete(id).unwrap();
        assert!(store.get(id).unwrap().is_none());
    }

    #[test]
    fn key_name_is_stable_and_contains_only_profile_id() {
        let id = Uuid::parse_str("00000000-0000-4000-8000-000000000001").unwrap();
        assert_eq!(SystemCredentialStore::username(id), format!("profile:{id}"));
        assert_eq!(CREDENTIAL_SERVICE, "org.contamstudio.ai-provider");
    }
}
