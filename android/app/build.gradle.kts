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
}
