def tilt_impl(ctx: AnalysisContext) -> list[[DefaultInfo, RunInfo]]:
    return _invoke_tilt(ctx, ctx.attrs.subcmd)

tilt = rule(
    impl = tilt_impl,
    attrs = {
        "subcmd": attrs.enum(["up", "down"]),
        "tiltfile": attrs.string(
            default = "Tiltfile",
            doc = """The Tiltfile to run.""",
        ),
    },
)

def _invoke_tilt(ctx: AnalysisContext, subcmd: str) -> list[[DefaultInfo, RunInfo]]:
    tiltfile = "{}/{}".format(
        ctx.label.package,
        ctx.attrs.tiltfile,
    )

    script = ctx.actions.write("tilt-run.sh", """\
#!/usr/bin/env bash
set -euo pipefail

rootpath="$(git rev-parse --show-toplevel)"
subcmd="$1"
tiltfile="$2"

tilt "$subcmd" --file "$rootpath"/"$tiltfile"
""", is_executable = True)

    run_cmd_args = cmd_args([
        script,
        subcmd,
        tiltfile,
    ])

    args_file = ctx.actions.write("tilt-args.txt", run_cmd_args)

    return [
        DefaultInfo(default_output = args_file),
        RunInfo(run_cmd_args),
    ]

