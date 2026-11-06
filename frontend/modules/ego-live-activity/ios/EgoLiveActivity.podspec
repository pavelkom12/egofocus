Pod::Spec.new do |s|
  s.name = 'EgoLiveActivity'
  s.version = '1.0.0'
  s.summary = 'EgoFocus local Live Activity bridge'
  s.description = s.summary
  s.author = 'EgoFocus'
  s.homepage = 'https://github.com/pavelkom12/egofocus'
  s.license = { :type => 'MIT' }
  s.source = { :git => 'https://github.com/pavelkom12/egofocus.git' }
  s.platforms = { :ios => '17.0' }
  s.swift_version = '5.9'
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '*.swift'
  s.frameworks = 'ActivityKit', 'AppIntents'
  s.libraries = 'sqlite3'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES', 'SWIFT_ACTIVE_COMPILATION_CONDITIONS' => '$(inherited) EGO_APP' }
end
