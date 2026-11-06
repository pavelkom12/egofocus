import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const xcode = require('xcode');
const plugin = require('../plugins/withLiveActivity.cjs');
const root = path.resolve(import.meta.dirname, '..');

test('Live Activity plugin embeds extension and is idempotent on Expo template', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'egofocus-widget-'));
  try {
    execFileSync('tar', [
      '-xf',
      path.join(root, 'node_modules/expo/template.tgz'),
      '-C',
      directory,
    ]);
    const ios = path.join(directory, 'package/ios');
    const project = xcode.project(
      path.join(ios, 'HelloWorld.xcodeproj/project.pbxproj'),
    );
    project.parseSync();
    const config = plugin({
      name: 'EgoFocus',
      slug: 'egofocus',
      version: '0.1.0',
      ios: { bundleIdentifier: 'com.pavelkom12.egofocus', buildNumber: '1' },
    });
    const request = {
      projectRoot: root,
      platformProjectRoot: ios,
      projectName: 'HelloWorld',
    };
    const apply = () =>
      config.mods.ios.xcodeproj({
        ...config,
        modResults: project,
        modRequest: request,
      });
    await apply();
    assert.equal(project.getFirstTarget().firstTarget.dependencies.length, 1);
    const extensionTarget = Object.values(
      project.pbxNativeTargetSection(),
    ).find(
      (target) =>
        typeof target === 'object' &&
        target.name?.replaceAll('"', '') === 'EgoLiveActivity',
    );
    const configurations =
      project.pbxXCConfigurationList()[extensionTarget.buildConfigurationList]
        .buildConfigurations;
    const podspec = fs.readFileSync(
      path.join(root, 'modules/ego-live-activity/ios/EgoLiveActivity.podspec'),
      'utf8',
    );
    const podName = podspec.match(/s.name\s*=\s*'([^']+)'/)[1];
    for (const configuration of configurations) {
      const settings =
        project.pbxXCBuildConfigurationSection()[configuration.value]
          .buildSettings;
      assert.ok(settings.PRODUCT_MODULE_NAME);
      assert.notEqual(
        settings.PRODUCT_MODULE_NAME,
        podName,
        'Extension must not shadow the Expo native module',
      );
    }
    const once = project.writeSync();
    await apply();
    assert.equal(project.writeSync(), once);
    assert.match(once, /EgoLiveActivity.appex in Copy Files/);
    assert.match(once, /EgoLiveWidget.swift in Sources/);
    assert.match(once, /EgoAppIntents.swift in Sources/);
    assert.match(once, /com.pavelkom12.egofocus.activity/);
    assert.match(
      fs.readFileSync(
        path.join(ios, 'EgoLiveActivity/EgoActivityShared.swift'),
        'utf8',
      ),
      /LiveActivityIntent/,
    );
    const info = await config.mods.ios.infoPlist({
      ...config,
      modResults: {},
      modRequest: request,
    });
    assert.equal(info.modResults.NSSupportsLiveActivities, true);
    const pods = await config.mods.ios.podfileProperties({
      ...config,
      modResults: {},
      modRequest: request,
    });
    assert.equal(pods.modResults['ios.deploymentTarget'], '17.0');
  } finally {
    assert.ok(
      path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep),
    );
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
