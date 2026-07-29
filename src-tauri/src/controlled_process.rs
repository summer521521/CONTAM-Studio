use std::io;
use std::process::{Child, ChildStderr, ChildStdin, ChildStdout, Command, ExitStatus, Output};

#[cfg(windows)]
use std::os::windows::{io::AsRawHandle, process::CommandExt};

#[cfg(windows)]
use windows_sys::Win32::{
    Foundation::{CloseHandle, HANDLE, INVALID_HANDLE_VALUE},
    System::{
        Diagnostics::ToolHelp::{
            CreateToolhelp32Snapshot, Thread32First, Thread32Next, TH32CS_SNAPTHREAD, THREADENTRY32,
        },
        JobObjects::{
            AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
            SetInformationJobObject, TerminateJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
            JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
        },
        Threading::{
            OpenThread, ResumeThread, CREATE_NO_WINDOW, CREATE_SUSPENDED, THREAD_SUSPEND_RESUME,
        },
    },
};

/// A child process whose complete descendant tree is owned by the desktop app.
///
/// On Windows the process is created suspended, assigned to a private Job Object,
/// and only then resumed. Closing the Job Object terminates every process still in
/// that tree, including when the desktop process exits unexpectedly.
#[derive(Debug)]
pub(crate) struct ControlledChild {
    child: Option<Child>,
    #[cfg(windows)]
    job: Option<OwnedJob>,
}

impl ControlledChild {
    pub(crate) fn spawn(command: &mut Command) -> io::Result<Self> {
        #[cfg(windows)]
        {
            spawn_windows(command)
        }

        #[cfg(not(windows))]
        {
            command.spawn().map(|child| Self { child: Some(child) })
        }
    }

    fn child_mut(&mut self) -> &mut Child {
        self.child.as_mut().expect("controlled child is present")
    }

    pub(crate) fn stdin(&mut self) -> &mut Option<ChildStdin> {
        &mut self.child_mut().stdin
    }

    pub(crate) fn stdout(&mut self) -> &mut Option<ChildStdout> {
        &mut self.child_mut().stdout
    }

    pub(crate) fn stderr(&mut self) -> &mut Option<ChildStderr> {
        &mut self.child_mut().stderr
    }

    pub(crate) fn try_wait(&mut self) -> io::Result<Option<ExitStatus>> {
        let status = self.child_mut().try_wait()?;
        if status.is_some() {
            self.release_process_tree();
        }
        Ok(status)
    }

    pub(crate) fn wait(&mut self) -> io::Result<ExitStatus> {
        let status = self.child_mut().wait()?;
        self.release_process_tree();
        Ok(status)
    }

    pub(crate) fn kill(&mut self) -> io::Result<()> {
        #[cfg(windows)]
        {
            if let Some(job) = self.job.as_ref() {
                let result = unsafe { TerminateJobObject(job.0, 1) };
                if result == 0 {
                    return Err(io::Error::last_os_error());
                }
                return Ok(());
            }
        }

        self.child_mut().kill()
    }

    pub(crate) fn wait_with_output(mut self) -> io::Result<Output> {
        let child = self.child.take().expect("controlled child is present");
        let output = child.wait_with_output()?;
        self.release_process_tree();
        Ok(output)
    }

    fn release_process_tree(&mut self) {
        #[cfg(windows)]
        {
            self.job.take();
        }
    }
}

#[cfg(windows)]
#[derive(Debug)]
struct OwnedJob(HANDLE);

#[cfg(windows)]
unsafe impl Send for OwnedJob {}

#[cfg(windows)]
unsafe impl Sync for OwnedJob {}

#[cfg(windows)]
impl Drop for OwnedJob {
    fn drop(&mut self) {
        if !self.0.is_null() {
            unsafe {
                CloseHandle(self.0);
            }
        }
    }
}

#[cfg(windows)]
#[derive(Debug)]
struct OwnedHandle(HANDLE);

#[cfg(windows)]
impl Drop for OwnedHandle {
    fn drop(&mut self) {
        if !self.0.is_null() && self.0 != INVALID_HANDLE_VALUE {
            unsafe {
                CloseHandle(self.0);
            }
        }
    }
}

#[cfg(windows)]
fn create_kill_on_close_job() -> io::Result<OwnedJob> {
    let handle = unsafe { CreateJobObjectW(std::ptr::null(), std::ptr::null()) };
    if handle.is_null() {
        return Err(io::Error::last_os_error());
    }
    let job = OwnedJob(handle);
    let mut limits = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
    limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
    let configured = unsafe {
        SetInformationJobObject(
            job.0,
            JobObjectExtendedLimitInformation,
            (&limits as *const JOBOBJECT_EXTENDED_LIMIT_INFORMATION).cast(),
            std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
        )
    };
    if configured == 0 {
        return Err(io::Error::last_os_error());
    }
    Ok(job)
}

#[cfg(windows)]
fn resume_process_threads(process_id: u32) -> io::Result<()> {
    let snapshot = OwnedHandle(unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPTHREAD, 0) });
    if snapshot.0 == INVALID_HANDLE_VALUE {
        return Err(io::Error::last_os_error());
    }

    let mut entry = THREADENTRY32 {
        dwSize: std::mem::size_of::<THREADENTRY32>() as u32,
        ..THREADENTRY32::default()
    };
    if unsafe { Thread32First(snapshot.0, &mut entry) } == 0 {
        return Err(io::Error::last_os_error());
    }

    let mut resumed = 0usize;
    loop {
        if entry.th32OwnerProcessID == process_id {
            let thread =
                OwnedHandle(unsafe { OpenThread(THREAD_SUSPEND_RESUME, 0, entry.th32ThreadID) });
            if thread.0.is_null() {
                return Err(io::Error::last_os_error());
            }
            if unsafe { ResumeThread(thread.0) } == u32::MAX {
                return Err(io::Error::last_os_error());
            }
            resumed += 1;
        }
        if unsafe { Thread32Next(snapshot.0, &mut entry) } == 0 {
            break;
        }
    }

    if resumed == 0 {
        return Err(io::Error::new(
            io::ErrorKind::NotFound,
            "the suspended child process had no resumable thread",
        ));
    }
    Ok(())
}

#[cfg(windows)]
fn spawn_windows(command: &mut Command) -> io::Result<ControlledChild> {
    let job = create_kill_on_close_job()?;
    command.creation_flags(CREATE_SUSPENDED | CREATE_NO_WINDOW);
    let mut child = command.spawn()?;

    let assigned = unsafe { AssignProcessToJobObject(job.0, child.as_raw_handle() as HANDLE) };
    if assigned == 0 {
        let error = io::Error::last_os_error();
        let _ = child.kill();
        let _ = child.wait();
        return Err(error);
    }

    if let Err(error) = resume_process_threads(child.id()) {
        unsafe {
            TerminateJobObject(job.0, 1);
        }
        let _ = child.wait();
        return Err(error);
    }

    Ok(ControlledChild {
        child: Some(child),
        job: Some(job),
    })
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;
    use std::fs;
    use std::process::Stdio;
    use std::thread;
    use std::time::{Duration, Instant};
    use windows_sys::Win32::Foundation::WAIT_TIMEOUT;
    use windows_sys::Win32::System::Threading::{
        OpenProcess, WaitForSingleObject, PROCESS_QUERY_LIMITED_INFORMATION,
    };

    const SYNCHRONIZE_ACCESS: u32 = 0x0010_0000;

    fn process_is_running(process_id: u32) -> bool {
        let handle = OwnedHandle(unsafe {
            OpenProcess(
                PROCESS_QUERY_LIMITED_INFORMATION | SYNCHRONIZE_ACCESS,
                0,
                process_id,
            )
        });
        !handle.0.is_null() && unsafe { WaitForSingleObject(handle.0, 0) } == WAIT_TIMEOUT
    }

    fn spawn_test_tree(label: &str) -> (ControlledChild, u32, std::path::PathBuf) {
        let root = std::env::temp_dir().join(format!(
            "contam-studio-job-object-{label}-{}-{}",
            std::process::id(),
            uuid::Uuid::new_v4()
        ));
        fs::create_dir(&root).expect("create test root");
        let pid_path = root.join("grandchild.pid");
        let script_path = root.join("parent.ps1");
        let script = format!(
            "$child = Start-Process -FilePath 'powershell.exe' \
             -ArgumentList @('-NoLogo','-NoProfile','-NonInteractive','-Command',\
             'while ($true) {{ Start-Sleep -Milliseconds 100 }}') \
             -WindowStyle Hidden -PassThru\n\
             [IO.File]::WriteAllText('{}', [string]$child.Id)\n\
             while ($true) {{ Start-Sleep -Milliseconds 100 }}\n",
            pid_path.to_string_lossy().replace('\'', "''")
        );
        fs::write(&script_path, script).expect("write parent script");

        let mut command = Command::new("powershell.exe");
        command
            .args([
                "-NoLogo",
                "-NoProfile",
                "-NonInteractive",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
            ])
            .arg(&script_path)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        let child = ControlledChild::spawn(&mut command).expect("spawn controlled parent");

        let deadline = Instant::now() + Duration::from_secs(10);
        let grandchild_id = loop {
            if let Ok(text) = fs::read_to_string(&pid_path) {
                if let Ok(process_id) = text.trim().parse::<u32>() {
                    break process_id;
                }
            }
            assert!(
                Instant::now() < deadline,
                "grandchild process id was not published"
            );
            thread::sleep(Duration::from_millis(50));
        };
        assert!(process_is_running(grandchild_id));
        (child, grandchild_id, root)
    }

    fn assert_process_stops(process_id: u32) {
        let deadline = Instant::now() + Duration::from_secs(5);
        while process_is_running(process_id) && Instant::now() < deadline {
            thread::sleep(Duration::from_millis(50));
        }
        assert!(
            !process_is_running(process_id),
            "grandchild survived Job Object termination"
        );
    }

    #[test]
    fn kill_terminates_the_complete_windows_process_tree() {
        let (mut child, grandchild_id, root) = spawn_test_tree("kill");
        child.kill().expect("terminate controlled job");
        child.wait().expect("wait for controlled parent");
        assert_process_stops(grandchild_id);

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn dropping_the_job_handle_terminates_the_complete_windows_process_tree() {
        let (child, grandchild_id, root) = spawn_test_tree("drop");
        drop(child);
        assert_process_stops(grandchild_id);

        let _ = fs::remove_dir_all(root);
    }
}
