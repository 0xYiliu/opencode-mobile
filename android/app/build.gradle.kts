plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Only affects the first direct-connection password field's keyboard hint.
val passwordKeyboard = providers.gradleProperty("passwordKeyboard").orElse("false").map {
    require(it == "true" || it == "false") { "passwordKeyboard must be true or false" }
    it.toBoolean()
}

// Release signing is resolved EXCLUSIVELY from repo-external Gradle properties
// (issue #149): signing material never lives in this repo. The four properties
// (opencodeReleaseStoreFile / opencodeReleaseStorePassword / opencodeReleaseKeyAlias /
// opencodeReleaseKeyPassword) may come from ~/.gradle/gradle.properties, a -P flag or an
// ORG_GRADLE_PROJECT_* environment variable.
//   All four present  -> the release build type is signed with that config.
//   None present      -> release stays buildable and produces an UNSIGNED APK (logged below);
//                        release signature correctness is asserted by the release gate
//                        (apksigner verify + recorded certificate fingerprint), not here.
//   Some missing      -> fail fast, naming exactly which properties are missing.
val releaseSigningProperties = listOf(
    "opencodeReleaseStoreFile",
    "opencodeReleaseStorePassword",
    "opencodeReleaseKeyAlias",
    "opencodeReleaseKeyPassword",
)
val releaseSigningValues = releaseSigningProperties.associate { key ->
    key to providers.gradleProperty(key).orNull?.takeIf { it.isNotBlank() }
}
val releaseSigningPresent = releaseSigningValues.filterValues { it != null }
require(releaseSigningPresent.isEmpty() || releaseSigningPresent.size == releaseSigningProperties.size) {
    "release signing configuration is partially set; missing Gradle properties: " +
        releaseSigningProperties.filter { releaseSigningValues[it] == null }.joinToString(", ")
}
val releaseSigningComplete = releaseSigningPresent.size == releaseSigningProperties.size

android {
    namespace = "ai.opencode.mobile"
    compileSdk = 36

    defaultConfig {
        applicationId = "ai.opencode.mobile"
        minSdk = 29
        targetSdk = 36
        // versionCode scheme (issue #149, release-runbook): major×10000 + minor×100 + patch.
        // Strictly order-preserving for major≥1, minor≤98, patch≤99 (1.99.99=19999 < 2.0.0=20000;
        // 2.9.99=20999 < 2.10.0=21000); 2.2.1 -> 20201 (monotonic over the installed 0.1.0/1).
        versionCode = 20201
        versionName = "2.2.1"
        buildConfigField("int", "WEB_ASSET_PORT", "18090")
        buildConfigField("boolean", "PASSWORD_KEYBOARD", passwordKeyboard.get().toString())
    }

    buildFeatures { buildConfig = true }

    if (releaseSigningComplete) {
        signingConfigs {
            create("release") {
                storeFile = file(requireNotNull(releaseSigningValues["opencodeReleaseStoreFile"]))
                storePassword = requireNotNull(releaseSigningValues["opencodeReleaseStorePassword"])
                keyAlias = requireNotNull(releaseSigningValues["opencodeReleaseKeyAlias"])
                keyPassword = requireNotNull(releaseSigningValues["opencodeReleaseKeyPassword"])
            }
        }
    } else {
        logger.lifecycle(
            "opencode release signing: no signing properties found; :app:assembleRelease will produce an UNSIGNED APK",
        )
    }

    buildTypes {
        release {
            // Signing material never lives in this repo: the config above is built only from
            // repo-external Gradle properties; without them release produces an unsigned APK.
            if (releaseSigningComplete) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    // aapt2's default ignoreAssets pattern contains `<dir>_*`, which silently drops
    // every underscore-prefixed directory — including the web build's entire `_assets/`
    // chunk directory. Re-list the default pattern without that rule (dotfiles stay
    // ignored) so the packaged web payload is complete.
    androidResources {
        ignoreAssetsPattern =
            "!.svn:!.git:!.gitignore:!.ds_store:!*.scc:.*:!CVS:!thumbs.db:!picasa.ini:!*~"
    }

    packaging {
        // jsch and bcprov both ship multi-release OSGi manifest entries at several
        // version levels; they are jar metadata with no runtime role on Android, so
        // packaging may drop the duplicates.
        resources {
            excludes += setOf("META-INF/versions/*/OSGI-INF/MANIFEST.MF")
        }
    }
}

// Never package stale, unmarked or partially published WebView assets.
val verifyAndroidWebAssets by tasks.registering(Exec::class) {
    val repo = rootProject.projectDir.parentFile
    commandLine("python3", repo.resolve("scripts/android_web_assets.py"), "verify")
}
tasks.matching { it.name.startsWith("merge") && it.name.endsWith("Assets") }.configureEach {
    dependsOn(verifyAndroidWebAssets)
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}

dependencies {
    testImplementation("junit:junit:4.13.2")
    // Apache-2.0, belongs in the third-party notice.
    implementation("org.nanohttpd:nanohttpd:2.3.1")
    // SSH transport (issue #6, decision 0003 §1). Revised BSD (3-clause) incl. the bundled
    // JZlib (BSD-style) and jBCrypt (ISC) components — permissive; belongs in the
    // third-party notice. Lives ONLY behind the ssh bridge package; the shared JS layer has
    // zero SSH dependencies (platform boundary).
    implementation("com.github.mwiede:jsch:2.28.8")
    // Bouncy Castle provider (issue #6, decision 0003 §1): curve25519/ed25519/chacha20 on
    // API 29-32 where the platform JCE lacks XDH/Ed25519. Bouncy Castle Licence (MIT-
    // adapted, bouncycastle.org/licence.html); belongs in the third-party notice.
    implementation("org.bouncycastle:bcprov-jdk18on:1.80")
    // AndroidX WebKit (Apache-2.0; notice remains subject to the repository's existing V4 gate).
    // Origin- and frame-aware vault messaging; pinned stable artifact.
    implementation("androidx.webkit:webkit:1.14.0")
}
