import { spawnSync } from 'node:child_process';
// pnpm on PATH first, then corepack pinned to the exact version.
export function pnpmRunners(pnpmVersion) {
    return [
        {
            command: 'pnpm', args: [], label: 'pnpm (on PATH)',
        },
        {
            command: 'corepack', args: [`pnpm@${pnpmVersion}`], label: `corepack pnpm@${pnpmVersion}`,
        },
    ];
}
// Last line of `pnpm --version` stdout that looks like a version. pnpm may
// print notices around it while it switches versions.
export function parsePnpmVersion(stdout) {
    return stdout.split(/\r?\n/).map(line => line.trim()).findLast(line => /^\d+\.\d+\.\d+/.test(line));
}
function lastLines(text, count) {
    return text.trim().split(/\r?\n/).slice(-count).join(' | ');
}
// Probes each runner in order and returns the first that runs pnpm `major`.
// Pure apart from the injected probe, so the fallback order is unit-testable.
export function selectPnpmRunner(runners, major, probe) {
    const failures = [];
    for (const runner of runners) {
        const result = probe(runner);
        if (result.errorCode !== undefined) {
            failures.push(result.errorCode === 'ENOENT'
                ? {
                    runner, kind: 'missing', reason: 'not found on PATH (ENOENT)',
                }
                : {
                    runner, kind: 'unstartable', reason: `could not be started (${result.errorCode})`,
                });
            continue;
        }
        const version = parsePnpmVersion(result.stdout);
        if (result.status !== 0 || version === undefined) {
            const detail = lastLines(`${result.stderr}\n${result.stdout}`, 2);
            failures.push({
                runner, kind: 'failed', reason: `\`--version\` exited ${result.status ?? 'abnormally'}${detail ? `: ${detail}` : ''}`,
            });
            continue;
        }
        if (version.split('.', 1)[0] !== major) {
            failures.push({
                runner, kind: 'wrong-major', reason: `runs pnpm ${version}, not ${major}.x`,
            });
            continue;
        }
        return {
            runner, version, failures,
        };
    }
    return { failures };
}
// The message printed when no runner works. `continueWith` is the command
// sequence that finishes the job once pnpm is installed.
export function pnpmUnavailableMessage(pnpmVersion, failures, continueWith) {
    const major = pnpmVersion.split('.', 1)[0];
    const kinds = new Set(failures.map(f => f.kind));
    const hints = [];
    if (kinds.has('failed') || kinds.has('wrong-major')) {
        hints.push(`  # The pnpm on PATH could not run pnpm ${major}; upgrading it to ${major} fixes that.`);
    }
    if (kinds.has('unstartable')) {
        hints.push(`  # ENOEXEC: npm skipped pnpm's install script. Reinstall with: npm i -g pnpm@${major} --allow-scripts=pnpm`);
    }
    return [
        `pnpm ${major} is needed to install the generated project (package.json pins pnpm@${pnpmVersion}), but no usable pnpm was found:`,
        ...failures.map(f => `  - ${f.runner.label}: ${f.reason}`),
        '',
        'Node.js 25+ no longer bundles corepack. Install pnpm, then finish the scaffold:',
        `  npm i -g pnpm@${major}    # standalone pnpm; it switches itself to the pinned version`,
        '  # or: npm i -g corepack && corepack enable pnpm',
        ...hints,
        '',
        `The project files are already written. Next: ${continueWith}`,
    ].join('\n');
}
// spawnSync reports a process that never started through `error` (with
// `status` null); its errno code is what tells "not installed" from "cannot run".
function spawnErrorCode(error) {
    if (error === undefined)
        return undefined;
    const { code } = error;
    return typeof code === 'string' ? code : error.name;
}
export function probeWithSpawn(cwd) {
    return (runner) => {
        const r = spawnSync(runner.command, [...runner.args, '--version'], { cwd, encoding: 'utf8' });
        return {
            errorCode: spawnErrorCode(r.error),
            status: r.status,
            stdout: r.stdout ?? '',
            stderr: r.stderr ?? '',
        };
    };
}
//# sourceMappingURL=pnpm-runner.js.map