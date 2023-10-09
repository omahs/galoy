load(
    "@prelude//:artifacts.bzl",
    "ArtifactGroupInfo",
)

load("@prelude//python:toolchain.bzl", "PythonToolchainInfo",)
load(":toolchain.bzl", "WorkspacePnpmToolchainInfo",)

def npm_bin_impl(ctx: AnalysisContext) -> list[[DefaultInfo, RunInfo, TemplatePlaceholderInfo]]:
    bin_name = ctx.attrs.bin_name or ctx.attrs.name

    exe = ctx.actions.declare_output(bin_name)

    workspace_pnpm_toolchain = ctx.attrs._workspace_pnpm_toolchain[WorkspacePnpmToolchainInfo]

    cmd = cmd_args(
        ctx.attrs._python_toolchain[PythonToolchainInfo].interpreter,
        workspace_pnpm_toolchain.build_npm_bin[DefaultInfo].default_outputs,
        "--bin-out-path",
        exe.as_output(),
        "--package-dir",
        ctx.label.package,
        ctx.attrs.node_modules,
        bin_name
    )

    ctx.actions.run(cmd, category = "build_npm_bin", identifier = ctx.label.package + " " + bin_name)

    return [
        DefaultInfo(default_output = exe),
        RunInfo(exe),
        TemplatePlaceholderInfo(
            keyed_variables = {
                "exe": exe,
            },
        ),
    ]

_npm_bin = rule(
    impl = npm_bin_impl,
    attrs = {
        "bin_name": attrs.option(
            attrs.string(),
            default = None,
            doc = """Node module bin name (default: attrs.name).""",
        ),
        "node_modules": attrs.source(
            doc = """Target which builds `node_modules`.""",
        ),
        "_python_toolchain": attrs.toolchain_dep(
            default = "toolchains//:python",
            providers = [PythonToolchainInfo],
        ),
        "_workspace_pnpm_toolchain": attrs.toolchain_dep(
            default = "toolchains//:workspace_pnpm",
            providers = [WorkspacePnpmToolchainInfo],
        ),
    },
)

def npm_bin(
        node_modules = ":node_modules",
        **kwargs):
    _npm_bin(
        node_modules = node_modules,
        **kwargs,
    )

def pnpm_workspace_impl(ctx: AnalysisContext) -> list[[DefaultInfo, ArtifactGroupInfo]]:
    out = ctx.actions.declare_output("pnpm-lock.yaml")

    output = ctx.actions.copy_file(out, ctx.attrs.pnpm_lock)
    ctx.actions.write_json("member-packages.json", ctx.attrs.child_packages)

    return [
        DefaultInfo(default_output = output),
        ArtifactGroupInfo(artifacts = [
            ctx.attrs.root_package,
            ctx.attrs.pnpm_lock,
            ctx.attrs.workspace_def,
        ] + ctx.attrs.child_packages),
    ]

def pnpm_workspace(**kwargs):
    pnpm_lock = "pnpm-lock.yaml"
    if not rule_exists(pnpm_lock):
        native.export_file(
            name = pnpm_lock
        )
    root_package = "package.json"
    if not rule_exists(root_package):
        native.export_file(
            name = root_package
        )
    workspace_def = "pnpm-workspace.yaml"
    if not rule_exists(workspace_def):
        native.export_file(
            name = workspace_def
        )
    _pnpm_workspace(
        pnpm_lock = ":{}".format(pnpm_lock),
        root_package = ":{}".format(root_package),
        workspace_def = ":{}".format(workspace_def),
        **kwargs,
    )

_pnpm_workspace = rule(
    impl = pnpm_workspace_impl,
    attrs = {
        "workspace_def": attrs.source(
            doc = """pnpm-workspace.yaml source.""",
        ),
        "root_package": attrs.source(
            doc = """Workspace root package.json source.""",
        ),
        "pnpm_lock": attrs.source(
            doc = """Pnpm lock file.""",
        ),
        "child_packages": attrs.list(
            attrs.source(),
            default = [],
            doc = """List of package.json files to track.""",
        ),
    },
)

def build_node_modules_impl(ctx: AnalysisContext) -> list[DefaultInfo]:
    out = ctx.actions.declare_output("root", dir = True)

    pnpm_toolchain = ctx.attrs._workspace_pnpm_toolchain[WorkspacePnpmToolchainInfo]
    package_dir = cmd_args(ctx.label.package).relative_to(ctx.label.cell_root)

    cmd = cmd_args(
        ctx.attrs._python_toolchain[PythonToolchainInfo].interpreter,
        pnpm_toolchain.build_node_modules[DefaultInfo].default_outputs,
        "--turbo-bin",
        ctx.attrs.turbo_bin[RunInfo],
    )

    cmd.add("--package-dir")
    cmd.add(package_dir)

    identifier = "install "
    if ctx.attrs.prod_only:
        cmd.add("--prod-only")
        identifier += "--prod "

    cmd.add(out.as_output())
    cmd.hidden([ctx.attrs.workspace])

    ctx.actions.run(cmd, category = "pnpm", identifier = identifier + ctx.label.package)

    return [DefaultInfo(default_output = out)]

build_node_modules = rule(
    impl = build_node_modules_impl,
    attrs = {
        "turbo_bin": attrs.dep(
            providers = [RunInfo],
            default = "//shim/custom-third-party/node/turbo:turbo_bin",
            doc = """Turbo dependency.""",
        ),
        "workspace": attrs.source(
            default = "//:workspace",
            doc = """Workspace root files""",
        ),
        "prod_only": attrs.bool(
            default = False,
            doc = "Only install production dependencies"
        ),
        "_python_toolchain": attrs.toolchain_dep(
            default = "toolchains//:python",
            providers = [PythonToolchainInfo],
        ),
        "_workspace_pnpm_toolchain": attrs.toolchain_dep(
            default = "toolchains//:workspace_pnpm",
            providers = [WorkspacePnpmToolchainInfo],
        ),
    },
)

def tsc_build_impl(ctx: AnalysisContext) -> list[DefaultInfo]:
    build_context = prepare_build_context(ctx)

    out = ctx.actions.declare_output("dist", dir = True)
    pnpm_toolchain = ctx.attrs._workspace_pnpm_toolchain[WorkspacePnpmToolchainInfo]

    cmd = cmd_args(
        ctx.attrs._python_toolchain[PythonToolchainInfo].interpreter,
        pnpm_toolchain.compile_typescript[DefaultInfo].default_outputs,
        "--package-dir",
        cmd_args([build_context.workspace_root, ctx.label.package], delimiter = "/"),
        "--tsc-bin",
        cmd_args(ctx.attrs.tsc[RunInfo]),
        "--tsconfig",
        cmd_args(ctx.attrs.tsconfig),
        "--tscpaths-bin",
        cmd_args(ctx.attrs.tscpaths[RunInfo]),
        cmd_args(out.as_output()),
    )

    ctx.actions.run(cmd, category = "tsc", identifier = ctx.label.package)

    return [
        DefaultInfo(default_output = out),
    ]

def tsc_build(
    node_modules = ":node_modules",
    **kwargs):
    tsc_bin = "tsc_bin"
    if not rule_exists(tsc_bin):
        npm_bin(
            name = tsc_bin,
            bin_name = "tsc",
        )
    tscpaths_bin = "tscpaths_bin"
    if not rule_exists(tscpaths_bin):
        npm_bin(
            name = tscpaths_bin,
            bin_name = "tscpaths",
        )
    _tsc_build(
        tsc = ":{}".format(tsc_bin),
        tscpaths = ":{}".format(tscpaths_bin),
        node_modules = node_modules,
        **kwargs,
    )

_tsc_build = rule(
    impl = tsc_build_impl,
    attrs = {
        "tsc": attrs.dep(
            providers = [RunInfo],
            doc = """TypeScript compiler dependency.""",
        ),
        "tsconfig": attrs.string(
            doc = """Target which builds `tsconfig.json`.""",
        ),
        "tscpaths": attrs.dep(
            providers = [RunInfo],
            doc = """tscpaths dependency.""",
        ),
        "srcs": attrs.list(
            attrs.source(),
            default = [],
            doc = """List of package source files to track.""",
        ),
        "node_modules": attrs.source(
            doc = """Target which builds package `node_modules`.""",
        ),
        "_python_toolchain": attrs.toolchain_dep(
            default = "toolchains//:python",
            providers = [PythonToolchainInfo],
        ),
        "_workspace_pnpm_toolchain": attrs.toolchain_dep(
            default = "toolchains//:workspace_pnpm",
            providers = [WorkspacePnpmToolchainInfo],
        ),
    },
)

def runnable_tsc_build_impl(ctx: AnalysisContext) -> list[DefaultInfo]:
    out = ctx.actions.declare_output("runnable_tsc_dist", dir = True)

    pnpm_toolchain = ctx.attrs._workspace_pnpm_toolchain[WorkspacePnpmToolchainInfo]
    package_dir = cmd_args(ctx.label.package).relative_to(ctx.label.cell_root)

    dist_path = ctx.attrs.tsc_build[DefaultInfo].default_outputs[0]

    cmd = cmd_args(
        ctx.attrs._python_toolchain[PythonToolchainInfo].interpreter,
        pnpm_toolchain.package_runnable_tsc_build[DefaultInfo].default_outputs,
        "--package-dir",
        package_dir,
        "--node-modules-path",
        ctx.attrs.node_modules_prod[DefaultInfo].default_outputs[0],
        "--dist-path",
        dist_path,
        out.as_output()
    )

    ctx.actions.run(cmd, category = "runnable_tsc_build")

    return [DefaultInfo(default_output = out)]

def runnable_tsc_build(
        tsc_build = ":build",
        node_modules_prod = ":node_modules_prod",
        **kwargs):
    _runnable_tsc_build(
        tsc_build = tsc_build,
        node_modules_prod = node_modules_prod,
        **kwargs,
    )

_runnable_tsc_build = rule(
    impl = runnable_tsc_build_impl,
    attrs = {
        "tsc_build": attrs.dep(
            doc = """Target which builds the Typescript dist artifact.""",
        ),
        "node_modules_prod": attrs.dep(
            doc = """Target which builds package `node_modules` with prod-only modules.""",
        ),
        "_python_toolchain": attrs.toolchain_dep(
            default = "toolchains//:python",
            providers = [PythonToolchainInfo],
        ),
        "_workspace_pnpm_toolchain": attrs.toolchain_dep(
            default = "toolchains//:workspace_pnpm",
            providers = [WorkspacePnpmToolchainInfo],
        ),
    }
)

BuildContext = record(
    workspace_root = field(Artifact),
)


def prepare_build_context(ctx: AnalysisContext) -> BuildContext:
    workspace_root = ctx.actions.declare_output("__workspace", dir = True)

    pnpm_toolchain = ctx.attrs._workspace_pnpm_toolchain[WorkspacePnpmToolchainInfo]
    package_dir = cmd_args(ctx.label.package).relative_to(ctx.label.cell_root)

    cmd = cmd_args(
        ctx.attrs._python_toolchain[PythonToolchainInfo].interpreter,
        pnpm_toolchain.prepare_build_context[DefaultInfo].default_outputs,
        "--package-dir",
        package_dir,
        "--node-modules-path",
        ctx.attrs.node_modules,
    )
    for src in ctx.attrs.srcs:
        cmd.add("--src")
        cmd.add(cmd_args(src, format = ctx.label.package + "={}"))
    # needed when we have workspace level dependencies
    # for (name, src) in ctx.attrs.prod_deps_srcs.items():
    #     cmd.add("--src")
    #     cmd.add(cmd_args(src, format = name + "={}"))
    # for (name, src) in ctx.attrs.dev_deps_srcs.items():
    #     cmd.add("--src")
    #     cmd.add(cmd_args(src, format = name + "={}"))
    cmd.add(workspace_root.as_output())

    ctx.actions.run(cmd, category = "prepare_build_context", identifier = ctx.label.package)

    return BuildContext(
        workspace_root = workspace_root,
    )
