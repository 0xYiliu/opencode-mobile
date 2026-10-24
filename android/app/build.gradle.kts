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
    }

    buildTypes {
        release {
            // No signing configuration on purpose: signing material never lives in this repo.
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}

dependencies {
    // Sole runtime dependency (Apache-2.0, belongs in the third-party notice). Zero androidx.
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
}
