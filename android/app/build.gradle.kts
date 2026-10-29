plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "ai.opencode.mobile"
    compileSdk = 36

    defaultConfig {
        applicationId = "ai.opencode.mobile"
        minSdk = 29
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"
        buildConfigField("int", "WEB_ASSET_PORT", "18090")
    }

    buildFeatures { buildConfig = true }

    buildTypes {
        release {
            // No signing configuration on purpose: signing material never lives in this repo.
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
