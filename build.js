#!/usr/bin/env node

// IMPORTANT: The declaration order control how we will update/publish the packages
// Example: Express is dependant on BodyParser, Qs
// So we need to write: [ Qs, BodyParser, Express ]
const projects =
    [
        "After",
        "Connect",
        "BodyParser",
        "Methods",
        "Mime",
        "Qs",
        "RangeParser",
        "ExpressServeStaticCore",
        "ServeStatic",
        "SuperAgent",
        "SuperTest",
        "Express"
    ]

const yargs = require('yargs')
const { hideBin } = require('yargs/helpers')
const concurrently = require('concurrently')
const path = require("path")
const fs = require('fs').promises
const fg = require("fast-glob")
const util = require('util')
const exec = util.promisify(require('child_process').exec)
const spawn = util.promisify(require("child_process").spawn)
const parseChangelog = require('changelog-parser')
const awaitSpawn = require("./Scripts/await-spawn")
const chalk = require("chalk")

const info = chalk.blueBright
const warn = chalk.yellow
const error = chalk.red
const success = chalk.green
const log = console.log

const cleanCompiledFiles = async function () {
    const entries =
        await fg([
            "glues/**/*.fs.js",
            "tests-shared/**/*.fs.js",
        ]);

    // Delete all the files generated by Fable
    for (const entry of entries) {
        await fs.unlink(entry)
    }

    // Delete .fable cache folders
    const fableCacheFolders =
        await fg([
            "glues/**/.fable"
        ], {
            onlyDirectories: true,
            markDirectories: true
        })

    for (const fableCacheFolder of fableCacheFolders) {
        await fs.rm(fableCacheFolder, { recursive: true, force: true })
    }
}

const getEnvVariable = function (varName) {
    const value = process.env[varName];
    if (value === undefined) {
        log(error(`Missing environnement variable ${varName}`))
        process.exit(1)
    } else {
        return value;
    }
}

const findRequiredSingleFile = async (pattern, projectPath) => {
    const glob = await fg(pattern)

    if (glob.length === 0) {
        log(error(`fsproj file not found in ${projectPath}`))
        process.exit(1)
    }

    if (glob.length > 1) {
        log(error(`Several fsproj file found in ${projectPath}. It should only have one`))
        process.exit(1)
    }

    return glob[0];
}

const findOptionalSingleFile = async (pattern, projectPath) => {
    const glob = await fg(pattern)

    if (glob.length === 0) {
        return null;
    }

    if (glob.length > 1) {
        log(error(`Several fsproj file found in ${projectPath}. It should only have one`))
        process.exit(1)
    }

    return glob[0];
}

// Watch handler
// const watchHandler = async (argv) => {
//     await cleanCompiledFiles();

//     const mochaPattern = argv.pattern || 'src/*/tests/';

//     concurrently(
//         [
//             {
//                 command: `nodemon --inspect --watch tests --exec "npx mocha -r esm -r tests-shared/mocha.env.js --reporter dot --recursive ${mochaPattern}"`,
//             },
//             {
//                 // There is a bug in concurrently where cwd in command options is not taken into account
//                 // Waiting for https://github.com/kimmobrunfeldt/concurrently/pull/266 to merge
//                 command: "cd tests && dotnet fable Tests.fsproj --watch",
//                 cwd: path.resolve(__dirname, "tests")
//             }
//         ],
//         {
//             prefix: "none" // Disable name prefix
//         }
//     )
// }

const updateTestsCountHandler = async () => {
    log(warn("Command not yet ready"))
    // Get the list of root test folders suffixed with a trailing '/'
    // const rootTestFolders =
    //     await fg([
    //         "src/*/tests/*",
    //         "!tests/bin",
    //         "!tests/obj"
    //     ], {
    //         onlyDirectories: true,
    //         markDirectories: true
    //     })

    // let bindingsTestInfo = []
    // let testRunnerCount = 0

    // for (const rootFolder of rootTestFolders) {
    //     testRunnerCount++

    //     const bindingNamePrefix = "/tests"
    //     // Remove '/tests' prefix and the trailing '/' from the rootFolder
    //     const bindingName = rootFolder.substr(bindingNamePrefix.length).slice(0, -1)

    //     log(`Executing ${bindingName} - ${testRunnerCount}/${rootTestFolders.length}`)

    //     const res = await exec(`npx mocha -r esm -r -r tests-shared/mocha.env.js --reporter json --recursive ${rootFolder}`);
    //     const jsonResult = JSON.parse(res.stdout);

    //     bindingsTestInfo.push({
    //         bindingName: bindingName,
    //         count: jsonResult.stats.tests
    //     });
    // }

    // const testStatusTableBody =
    //     bindingsTestInfo
    //         .map((info) => {
    //             return `| ${info.bindingName} | ${info.count} |`
    //         })

    // const readmePath = path.resolve(__dirname, "README.md")

    // const readmeContent = await fs.readFile(readmePath)

    // const readmeLines =
    //     readmeContent
    //         .toString()
    //         .replace("\r\n", "\n")
    //         .split("\n")

    // const beginTestsStatusLineIndex = readmeLines.indexOf("<!-- DON'T REMOVE - begin tests status -->");
    // const endTestsStatusLineIndex = readmeLines.indexOf("<!-- DON'T REMOVE - end tests status -->");

    // const newReadmeContent =
    //     []
    //         .concat(
    //             readmeLines.slice(0, beginTestsStatusLineIndex + 1),
    //             [
    //                 "", // This create an empty line
    //                 "| Binding | Number of tests |",
    //                 "|---------|-----------------|"
    //             ],
    //             testStatusTableBody,
    //             readmeLines.slice(endTestsStatusLineIndex - 1)
    //         )
    //         .join("\n")

    // await fs.writeFile(readmePath, newReadmeContent)
}

const findProjectFsproj = async (project) => {
    return await findRequiredSingleFile(`glues/${project}/src/*.fsproj`, `glues/${project}/src`)
}

const findProjectChangelog = async (project) => {
    const changelogPath = path.resolve(__dirname, "glues", project, "CHANGELOG.md")

    // Check that changelog file exist
    try {
        await fs.access(changelogPath)
    } catch (error) {
        log(error(`Missing ${changelogPath} file`))
        process.exit(1)
    }

    return changelogPath;
}

const runtestForProjectInWatchMode = async (project) => {
    const testFsprojPath = await findRequiredSingleFile(`glues/${project}/tests/*.fsproj`, `glues/${project}/tests`)

    const testFsprojDirectory = path.dirname(testFsprojPath)
    const testFolderToWatch = `glues/${project}/tests`

    await concurrently(
        [
            {
                command: `nodemon --inspect --watch ${testFolderToWatch} --exec "npx mocha -r esm -r tests-shared/mocha.env.js --reporter dot --recursive ${testFolderToWatch}"`,
            },
            {
                // There is a bug in concurrently where cwd in command options is not taken into account
                // Waiting for https://github.com/kimmobrunfeldt/concurrently/pull/266 to merge
                command: `cd ${testFsprojDirectory} && dotnet fable --watch`,
                cwd: testFsprojDirectory
            }
        ],
        {
            prefix: "none" // Disable name prefix
        }
    )
}

const runTestForAProject = async (project) => {
    const projectFsprojPath = await findProjectFsproj(project)
    const testFsprojPath = await findOptionalSingleFile(`glues/${project}/tests/*.fsproj`, `glues/${project}/tests`)

    log(info("=================="))
    log(info(`Begin testing ${project}`))

    // If there is no tests project, we compile the glues definition to make sure everything is ok in the project
    if (testFsprojPath === null) {
        log(`No tests project found for ${project}, testing the bindings using 'dotnet buil'`)
        try {
            await awaitSpawn(
                "dotnet",
                `build ${projectFsprojPath}`.split(" "),
                {
                    stdio: "inherit",
                    shell: true
                }
            )
        } catch (e) {
            log(error(`Error while compiling ${project}. Stopping here`))
            process.exit(1)
        }
        log(info(`Testing ${project} done`))
        log(info("==================\n\n"))

        return; // Stop here
    }

    // Compile the tests using Fable
    try {
        await awaitSpawn(
            "dotnet",
            `fable ${testFsprojPath}`.split(" "),
            {
                stdio: "inherit",
                shell: true
            }
        )

        // Run the tests using mocha
        await awaitSpawn(
            "npx",
            `mocha -r esm -r tests-shared/mocha.env.js --reporter dot --reporter dot --recursive glues/${project}/tests`.split(" "),
            {
                stdio: "inherit",
                shell: true,
            }
        )
    } catch (e) {
        log(error(`Error while compiling or running the tests for ${project}. Stopping here`))
        process.exit(1)
    }

    log(info(`Testing ${project} done`))
    log(info("==================\n\n"))
}

const testRunner = async (argv) => {
    await cleanCompiledFiles()

    if (argv.watch === true && argv.project === undefined) {
        log(error("Options --watch can only be used if you specify a project"))
        process.exit(1)
    }

    if (argv.watch) {
        // Compile and test in watch mode
        const project =
            projects.find((p) => {
                return p.toLocaleLowerCase() === argv.project.toLocaleLowerCase()
            })

        if (project === undefined) {
            log(error(`Project '${argv.project}' not found. If you just created it, please make sure to add it to the projects list in build.js file`))
            process.exit(1)
        }

        await runtestForProjectInWatchMode(project)

    } else {
        // Compile and test once then exit
        if (argv.project !== undefined) {
            const project =
                projects.find((p) => {
                    return p.toLocaleLowerCase() === argv.project.toLocaleLowerCase()
                })

            if (project === undefined) {
                log(error(`Project '${argv.project}' not found. If you just created it, please make sure to add it to the projects list in build.js file`))
                process.exit(1)
            }

            await runTestForAProject(project)

        } else {
            for (const project of projects) {
                await runTestForAProject(project)
            }
        }

    }
}

const publishHandler = async () => {
    // Check if all the required env variables are defined
    const NUGET_KEY = getEnvVariable("NUGET_KEY")

    // 1. Remove Fable compiled files
    await cleanCompiledFiles()

    for (const project of projects) {
        await runTestForAProject(project)

        const projectFsproj = await findProjectFsproj(project)

        const changelogPath = await findProjectChangelog(project)

        const fsprojContent = (await fs.readFile(projectFsproj)).toString()

        // Normalize the new lines otherwise parseChangelog isn't able to parse the file correctly
        const changelogContent = (await fs.readFile(changelogPath)).toString().replace("\r\n", "\n")
        const changelog = await parseChangelog({ text: changelogContent })

        // Check if the changelog has at least 2 versions in it
        // Unreleased & X.Y.Z
        if (changelog.versions.length < 2) {
            log(error(`No version to publish for ${project}`))
            process.exit(1)
        }

        const unreleased = changelog.versions[0];

        // Check malformed changelog
        if (unreleased.title !== "Unreleased") {
            log(error(`Malformed CHANGELOG.md file in ${project}`))
            log(error("The changelog should first version should be 'Unreleased'"))
            process.exit(1)
        }

        // Access via index is ok we checked the length before
        const newVersion = changelog.versions[1].version;

        if (newVersion.version === null) {
            log(error(`Malformed CHANGELOG.md file in ${project}`))
            log(error("Please verify the last version format, it should be SEMVER compliant"))
            process.exit(1)
        }

        const fsprojVersionRegex = /<Version>(.*)<\/Version>/gmi

        const m = fsprojVersionRegex.exec(fsprojContent)

        if (m === null) {
            log(error(`Missing <Version>..</Version> tag in ${projectFsproj}`))
            process.exit(1)
        }

        const lastPublishedVersion = m[1];

        if (lastPublishedVersion === newVersion) {
            log(`Version ${lastPublishedVersion} of ${project}, has already been published. Skipping this project`)
            continue;
        }

        log(`New version detected for ${project}, starting publish process for it`)

        const newFsprojContent = fsprojContent.replace(fsprojVersionRegex, `<Version>${newVersion}</Version>`)

        // Start a try-catch here, because we modfied the file on the disk
        // This allows to revert the changes made to the file is something goes wrong
        try {
            // Update fsproj file on the disk
            await fs.writeFile(projectFsproj, newFsprojContent)

            await awaitSpawn(
                "dotnet",
                `pack -c Release ${projectFsproj}`.split(' '),
                {
                    stdio: "inherit",
                    shell: true
                }
            )

            const nugetPackagePath = await findRequiredSingleFile(`glues/${project}/src/bin/Release/*${newVersion}.nupkg`)

            await awaitSpawn(
                "dotnet",
                `nuget push -s nuget.org -k ${NUGET_KEY} ${nugetPackagePath}`.split(' '),
                {
                    stdio: "inherit",
                    shell: true
                }
            )

            log(success(`Project ${project} has been published`))

        } catch (e) {
            log(error(`Something went wrong while publish ${project}`))
            log("Reverting changes made to the files")
            await fs.writeFile(projectFsproj, fsprojContent)
            log("Revert done")
            process.exit(1)
        }

    }
}

yargs(hideBin(process.argv))
    .completion()
    .strict()
    .help()
    .alias("help", "h")
    // .command(
    //     "watch",
    //     "Start Fable and mocha in watch mode. You should use this target when working on the bindings",
    //     (argv) => {
    //         argv
    //             .option(
    //                 "pattern",
    //                 {
    //                     description:
    //                         `Pattern used to determine which tests are run by mocha.
    //                     By default, we run all the tests but if you want to focus on the tests of Mime only you can pass '--pattern tests/Mime/'`,
    //                     type: "string"
    //                 }
    //             )
    //     },
    //     watchHandler
    // )
    // .command(
    //     "update-tests-count",
    //     "Execute the different tests and update tests count section of the README file",
    //     () => { },
    //     updateTestsCountHandler
    // )
    .command(
        "clean",
        "Delete all the compiled or cached files from dotnet, Fable.",
        () => {},
        async () => {
            await cleanCompiledFiles()
        }
    )
    .command(
        "publish",
        `1. Clean files
        2. For each package make a fresh compilation and run tests
        3. Update the version in the fsproj using the changelog as reference
        4. Generate the packages
        5. Publish new packages on NuGet

        Note: If an error occured, after updating the version in the fsproj the process will try to revert the changes on the current fsproj file.
        `,
        () => { },
        publishHandler
    )
    .command(
        "test",
        `Run test against project(s)

        By default, it will run test against all the projects.
        You can specify a project to run the test only for this one.
        `,
        (argv) => {
            argv
                .option(
                    "project",
                    {
                        description: `Name of the project you want to run the test for`,
                        alias: "p",
                        type: "string"
                    }
                )
                .option(
                    "watch",
                    {
                        description:
                            `Start Fable and Mocha in watch mode

                            This option can only be used if you specify a project
                            `,
                        alias: "w",
                        type: "boolean",
                        default: false
                    }
                )
        },
        testRunner
    )
    .version(false)
    .argv
