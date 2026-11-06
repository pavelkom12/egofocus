const {
  withXcodeProject,
  withInfoPlist,
  withPodfileProperties,
} = require('expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');

module.exports = function withLiveActivity(config) {
  config = withPodfileProperties(config, (cfg) => {
    cfg.modResults['ios.deploymentTarget'] = '17.0';
    return cfg;
  });
  config = withInfoPlist(config, (cfg) => {
    cfg.modResults.NSSupportsLiveActivities = true;
    return cfg;
  });
  return withXcodeProject(config, (cfg) => {
    const project = cfg.modResults;
    const name = 'EgoLiveActivity';
    const directory = path.join(cfg.modRequest.platformProjectRoot, name);
    const appTarget = project.getFirstTarget();
    const appList =
      project.pbxXCConfigurationList()[
        appTarget.firstTarget.buildConfigurationList
      ];
    for (const item of appList.buildConfigurations) {
      project.pbxXCBuildConfigurationSection()[
        item.value
      ].buildSettings.IPHONEOS_DEPLOYMENT_TARGET = '17.0';
    }
    const packageFile = 'EgoAppIntents.swift';
    fs.writeFileSync(
      path.join(cfg.modRequest.platformProjectRoot, packageFile),
      `import AppIntents
internal import EgoLiveActivity
struct EgoAppIntents: AppIntentsPackage {
  static var includedPackages: [any AppIntentsPackage.Type] { [EgoIntentsPackage.self] }
}
`,
    );
    if (!project.hasFile(packageFile))
      project.addSourceFile(
        packageFile,
        { target: appTarget.uuid },
        project.getFirstProject().firstProject.mainGroup,
      );
    fs.mkdirSync(directory, { recursive: true });
    for (const file of ['EgoActivityShared.swift', 'EgoLiveWidget.swift']) {
      fs.copyFileSync(
        path.join(
          cfg.modRequest.projectRoot,
          file === 'EgoActivityShared.swift'
            ? 'modules/ego-live-activity/ios'
            : 'native',
          file,
        ),
        path.join(directory, file),
      );
    }
    fs.writeFileSync(
      path.join(directory, `${name}-Info.plist`),
      `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleDisplayName</key><string>EgoFocus</string>
<key>CFBundleIdentifier</key><string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
<key>CFBundleExecutable</key><string>$(EXECUTABLE_NAME)</string>
<key>CFBundleName</key><string>$(PRODUCT_NAME)</string>
<key>CFBundlePackageType</key><string>XPC!</string>
<key>CFBundleShortVersionString</key><string>$(MARKETING_VERSION)</string>
<key>CFBundleVersion</key><string>$(CURRENT_PROJECT_VERSION)</string>
<key>NSExtension</key><dict><key>NSExtensionPointIdentifier</key><string>com.apple.widgetkit-extension</string></dict>
</dict></plist>`,
    );
    if (
      Object.values(project.pbxNativeTargetSection()).some(
        (target) =>
          typeof target === 'object' &&
          target.name?.replaceAll('"', '') === name,
      )
    )
      return cfg;
    project.hash.project.objects.PBXTargetDependency ??= {};
    project.hash.project.objects.PBXContainerItemProxy ??= {};
    const target = project.addTarget(
      name,
      'app_extension',
      name,
      `${cfg.ios.bundleIdentifier}.activity`,
    );
    project.addBuildPhase(
      [`${name}/EgoActivityShared.swift`, `${name}/EgoLiveWidget.swift`],
      'PBXSourcesBuildPhase',
      'Sources',
      target.uuid,
    );
    project.addBuildPhase(
      [],
      'PBXFrameworksBuildPhase',
      'Frameworks',
      target.uuid,
    );
    project.addBuildPhase(
      [],
      'PBXResourcesBuildPhase',
      'Resources',
      target.uuid,
    );
    const list =
      project.pbxXCConfigurationList()[
        target.pbxNativeTarget.buildConfigurationList
      ];
    for (const item of list.buildConfigurations) {
      Object.assign(
        project.pbxXCBuildConfigurationSection()[item.value].buildSettings,
        {
          SWIFT_VERSION: '5.0',
          PRODUCT_MODULE_NAME: 'EgoFocusWidget',
          IPHONEOS_DEPLOYMENT_TARGET: '17.0',
          TARGETED_DEVICE_FAMILY: '1',
          APPLICATION_EXTENSION_API_ONLY: 'YES',
          GENERATE_INFOPLIST_FILE: 'NO',
          CURRENT_PROJECT_VERSION: String(cfg.ios.buildNumber || '1'),
          MARKETING_VERSION: cfg.version || '1.0',
          CODE_SIGN_STYLE: 'Automatic',
        },
      );
    }
    return cfg;
  });
};
