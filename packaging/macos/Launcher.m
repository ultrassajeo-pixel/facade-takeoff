#import <AppKit/AppKit.h>
#import <CoreServices/CoreServices.h>

@interface Launcher : NSObject <NSApplicationDelegate>
@property(strong) NSWindow *window;
@property(strong) NSTextField *status;
@property(strong) NSButton *openButton;
@property(strong) NSButton *loginButton;
@property(strong) NSButton *updateButton;
@property(strong) NSTask *updateTask;
@property(strong) NSTask *server;
@property(strong) NSTask *loginTask;
@property(strong) NSPipe *lifetime;
@property(copy) NSURL *address;
@end

@implementation Launcher
- (NSString *)resource:(NSString *)name {
    return [NSBundle.mainBundle.resourcePath stringByAppendingPathComponent:name];
}
- (void)applicationDidFinishLaunching:(NSNotification *)note {
    NSMenu *bar = [NSMenu new];
    NSMenuItem *appItem = [NSMenuItem new];
    [bar addItem:appItem];
    NSMenu *menu = [NSMenu new];
    [menu addItemWithTitle:@"외벽산출 종료" action:@selector(terminate:) keyEquivalent:@"q"];
    appItem.submenu = menu;
    NSApp.mainMenu = bar;

    self.window = [[NSWindow alloc] initWithContentRect:NSMakeRect(0, 0, 540, 164)
        styleMask:NSWindowStyleMaskTitled | NSWindowStyleMaskClosable | NSWindowStyleMaskMiniaturizable
        backing:NSBackingStoreBuffered defer:NO];
    self.window.title = @"외벽산출";
    self.window.releasedWhenClosed = NO;
    self.status = [NSTextField wrappingLabelWithString:@"작업실을 여는 중입니다…"];
    self.status.frame = NSMakeRect(24, 77, 490, 62);
    [self.window.contentView addSubview:self.status];
    self.openButton = [NSButton buttonWithTitle:@"Safari에서 작업실 열기" target:self action:@selector(openWorkspace:)];
    self.openButton.frame = NSMakeRect(18, 25, 190, 34);
    self.openButton.enabled = NO;
    [self.window.contentView addSubview:self.openButton];
    self.loginButton = [NSButton buttonWithTitle:@"ChatGPT 로그인" target:self action:@selector(login:)];
    self.loginButton.frame = NSMakeRect(220, 25, 140, 34);
    [self.window.contentView addSubview:self.loginButton];
    self.updateButton = [NSButton buttonWithTitle:@"업데이트 확인" target:self action:@selector(checkUpdate:)];
    self.updateButton.frame = NSMakeRect(372, 25, 146, 34);
    [self.window.contentView addSubview:self.updateButton];
    [self.window center];
    [self.window makeKeyAndOrderFront:nil];
    [NSApp activateIgnoringOtherApps:YES];

    NSString *entry = [self resource:@"workspace/workspace-server.mjs"];
    self.server = [NSTask new];
    self.server.executableURL = [NSURL fileURLWithPath:[self resource:@"runtime/node"]];
    self.server.arguments = @[entry];
    NSMutableDictionary *env = [NSProcessInfo.processInfo.environment mutableCopy];
    env[@"FACADE_PROJECT_DIRECTORY"] = [NSHomeDirectory() stringByAppendingPathComponent:@"Library/Application Support/Facade Takeoff"];
    env[@"FACADE_CODEX_PATH"] = [self resource:@"runtime/codex"];
    self.server.environment = env;
    self.lifetime = [NSPipe pipe];
    self.server.standardInput = self.lifetime;
    NSPipe *ready = [NSPipe pipe];
    self.server.standardOutput = ready;
    self.server.standardError = NSFileHandle.fileHandleWithNullDevice;
    __weak Launcher *weakSelf = self;
    self.server.terminationHandler = ^(NSTask *task) {
        dispatch_async(dispatch_get_main_queue(), ^{
            weakSelf.address = nil;
            weakSelf.openButton.enabled = NO;
            weakSelf.status.stringValue = @"작업실을 열 수 없습니다. 실행 중인 외벽산출을 종료한 뒤 다시 여세요. 이 앱은 로컬 포트 18765를 사용합니다.";
        });
    };
    NSError *error = nil;
    if (![self.server launchAndReturnError:&error]) {
        self.status.stringValue = error.localizedDescription;
        return;
    }
    dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
        NSData *line = ready.fileHandleForReading.availableData;
        NSString *message = [[NSString alloc] initWithData:line encoding:NSUTF8StringEncoding];
        if (![message isEqualToString:@"http://127.0.0.1:18765/\n"]) return;
        dispatch_async(dispatch_get_main_queue(), ^{
            if (!weakSelf.server.running) return;
            weakSelf.address = [NSURL URLWithString:@"http://127.0.0.1:18765/"];
            weakSelf.openButton.enabled = YES;
            weakSelf.status.stringValue = @"Safari에서 도면을 열 수 있습니다. 이 창을 닫으면 작업실이 종료됩니다.";
            [weakSelf openWorkspace:nil];
        });
    });
}
- (NSString *)macVersion {
    return [NSBundle.mainBundle objectForInfoDictionaryKey:@"FacadeMacVersion"];
}
- (void)checkUpdate:(id)sender {
    self.updateButton.enabled = NO;
    self.status.stringValue = @"새 버전을 확인하는 중입니다…";
    [self runUpdate:@"check" version:nil];
}
- (void)runUpdate:(NSString *)action version:(NSString *)version {
    NSTask *task = [NSTask new];
    self.updateTask = task;
    task.executableURL = [NSURL fileURLWithPath:[self resource:@"runtime/node"]];
    NSMutableArray *args = [@[[self resource:@"packaging/macos/update.mjs"], action, self.macVersion] mutableCopy];
    if (version) [args addObject:version];
    task.arguments = args;
    NSPipe *output = [NSPipe pipe];
    task.standardOutput = output;
    task.standardError = NSFileHandle.fileHandleWithNullDevice;
    task.terminationHandler = ^(NSTask *finished) {
        NSData *bytes = output.fileHandleForReading.readDataToEndOfFile;
        NSDictionary *info = [NSJSONSerialization JSONObjectWithData:bytes options:0 error:NULL];
        dispatch_async(dispatch_get_main_queue(), ^{
            self.updateButton.enabled = YES;
            if (finished.terminationStatus || ![info isKindOfClass:NSDictionary.class]) {
                self.status.stringValue = info[@"error"] ?: @"업데이트를 확인하지 못했습니다. 다시 시도하세요.";
                return;
            }
            if ([action isEqual:@"download"]) {
                [self installPackage:info[@"path"] expected:version];
                return;
            }
            if ([info[@"version"] isEqual:self.macVersion]) {
                self.status.stringValue = [NSString stringWithFormat:@"현재 버전 %@가 최신입니다.", self.macVersion];
                return;
            }
            NSAlert *alert = [NSAlert new];
            alert.messageText = [NSString stringWithFormat:@"외벽산출 %@ 업데이트", info[@"version"]];
            alert.informativeText = [NSString stringWithFormat:@"현재 버전 %@ · 다운로드 %.0f MB. 작업을 저장한 후 진행하세요. 내려받은 파일을 검증한 뒤 macOS 설치 프로그램을 엽니다.", self.macVersion, [info[@"size"] doubleValue]/1000000];
            [alert addButtonWithTitle:@"다운로드 및 설치"];
            [alert addButtonWithTitle:@"나중에"];
            if ([alert runModal] == NSAlertFirstButtonReturn) {
                self.updateButton.enabled = NO;
                self.status.stringValue = @"업데이트 파일을 내려받아 검증하는 중입니다…";
                [self runUpdate:@"download" version:info[@"version"]];
            } else self.status.stringValue = @"현재 버전으로 계속 작업할 수 있습니다.";
        });
    };
    NSError *error = nil;
    if (![task launchAndReturnError:&error]) {
        self.updateButton.enabled = YES;
        self.status.stringValue = error.localizedDescription;
    }
}
- (void)installPackage:(NSString *)path expected:(NSString *)version {
    if (!path.length) { self.status.stringValue = @"검증된 설치 파일을 찾지 못했습니다."; return; }
    NSURL *packageURL = [NSURL fileURLWithPath:path];
    NSDictionary *quarantine = @{(__bridge NSString *)kLSQuarantineAgentNameKey:@"Facade Takeoff",
        (__bridge NSString *)kLSQuarantineTypeKey:(__bridge NSString *)kLSQuarantineTypeWebDownload};
    NSError *quarantineError = nil;
    if (![packageURL setResourceValue:quarantine forKey:NSURLQuarantinePropertiesKey error:&quarantineError]) {
        self.status.stringValue = quarantineError.localizedDescription;
        return;
    }
    NSTask *installer = [NSTask new];
    self.updateTask = installer;
    installer.executableURL = [NSURL fileURLWithPath:@"/usr/bin/open"];
    installer.arguments = @[@"-W", @"-b", @"com.apple.installer", path];
    installer.terminationHandler = ^(NSTask *finished) {
        dispatch_async(dispatch_get_main_queue(), ^{
            self.updateButton.enabled = YES;
            NSString *plist = [NSBundle.mainBundle.bundlePath stringByAppendingPathComponent:@"Contents/Info.plist"];
            NSString *installed = [NSDictionary dictionaryWithContentsOfFile:plist][@"FacadeMacVersion"];
            [[NSFileManager defaultManager] removeItemAtPath:path error:NULL];
            if (finished.terminationStatus || ![installed isEqual:version]) {
                self.status.stringValue = @"설치 완료를 확인하지 못했습니다. 업데이트 확인에서 다시 시도할 수 있습니다.";
                return;
            }
            // Wait for the old process to release the local port before relaunch.
            NSTask *reopen = [NSTask new];
            reopen.executableURL = [NSURL fileURLWithPath:@"/bin/sh"];
            reopen.arguments = @[@"-c", @"while kill -0 \"$1\" 2>/dev/null; do sleep 0.2; done; exec /usr/bin/open \"$2\"", @"reopen", @(NSProcessInfo.processInfo.processIdentifier).stringValue, NSBundle.mainBundle.bundlePath];
            if ([reopen launchAndReturnError:NULL]) [NSApp terminate:nil];
            else self.status.stringValue = @"설치가 끝났습니다. 앱을 종료한 뒤 다시 여세요.";
        });
    };
    NSError *error = nil;
    if ([installer launchAndReturnError:&error]) {
        self.updateButton.enabled = NO;
        self.status.stringValue = @"macOS 설치 창에서 설치를 마치고 창을 닫으면 새 버전이 열립니다.";
    } else self.status.stringValue = error.localizedDescription;
}
- (void)openWorkspace:(id)sender {
    if (!self.address) return;
    NSURL *safari = [NSWorkspace.sharedWorkspace URLForApplicationWithBundleIdentifier:@"com.apple.Safari"];
    if (!safari) { [NSWorkspace.sharedWorkspace openURL:self.address]; return; }
    [NSWorkspace.sharedWorkspace openURLs:@[self.address] withApplicationAtURL:safari
        configuration:NSWorkspaceOpenConfiguration.configuration completionHandler:^(NSRunningApplication *app, NSError *error) {
            if (error) dispatch_async(dispatch_get_main_queue(), ^{
                self.status.stringValue = @"Safari에서 http://127.0.0.1:18765/ 를 여세요.";
            });
        }];
}
- (void)login:(id)sender {
    self.loginTask = [NSTask new];
    self.loginTask.executableURL = [NSURL fileURLWithPath:[self resource:@"runtime/codex"]];
    self.loginTask.arguments = @[@"login"];
    self.loginTask.standardInput = NSFileHandle.fileHandleWithNullDevice;
    self.loginTask.standardOutput = NSFileHandle.fileHandleWithNullDevice;
    self.loginTask.standardError = NSFileHandle.fileHandleWithNullDevice;
    __weak Launcher *weakSelf = self;
    self.loginTask.terminationHandler = ^(NSTask *task) {
        dispatch_async(dispatch_get_main_queue(), ^{
            weakSelf.loginButton.enabled = YES;
            weakSelf.status.stringValue = task.terminationStatus == 0 ? @"로그인을 마쳤습니다. 작업실에서 연결 상태를 새로 확인하세요." : @"로그인을 마치지 못했습니다. 네트워크를 확인한 뒤 다시 시도하세요.";
        });
    };
    NSError *error = nil;
    if ([self.loginTask launchAndReturnError:&error]) {
        self.loginButton.enabled = NO;
        self.status.stringValue = @"브라우저에서 본인의 ChatGPT 계정으로 로그인하세요.";
    } else self.status.stringValue = error.localizedDescription;
}
- (BOOL)applicationShouldTerminateAfterLastWindowClosed:(NSApplication *)sender { return YES; }
- (BOOL)applicationShouldHandleReopen:(NSApplication *)sender hasVisibleWindows:(BOOL)visible {
    [self.window makeKeyAndOrderFront:nil];
    return YES;
}
- (void)applicationWillTerminate:(NSNotification *)note {
    [self.lifetime.fileHandleForWriting closeFile];
    if (self.server.running) [self.server terminate];
    if (self.loginTask.running) [self.loginTask terminate];
    if (self.updateTask.running) [self.updateTask terminate];
}
@end

int main(void) {
    @autoreleasepool {
        [NSApplication sharedApplication];
        [NSApp setActivationPolicy:NSApplicationActivationPolicyRegular];
        __attribute__((objc_precise_lifetime)) Launcher *launcher = [Launcher new];
        NSApp.delegate = launcher;
        [NSApp run];
    }
    return 0;
}
