pluginManagement {
    repositories {
        google {
            content {
                includeGroupByRegex("com\\.android.*")
                includeGroupByRegex("com\\.google.*")
                includeGroupByRegex("androidx.*")
            }
        }
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "MojiMori"

include(":app")
include(":core:model")
include(":core:srs")
include(":core:content")
include(":core:progress")
include(":core:study")
include(":core:ui")
include(":feature:dashboard")
include(":feature:lessons")
include(":feature:reviews")
include(":feature:practice")
include(":feature:browse")
