#!/usr/bin/env python3
"""
config_resolver.py — Shared resolution + provider formatting for mcpctl sync.

Eliminates the 3× duplicated Python blocks across sync_opencode(), sync_claude(),
and sync_gemini() in sync.sh. All path expansion, secret resolution, and provider
formatting lives here.

CLI:
    python3 config_resolver.py --action resolve
        → Outputs fully-resolved server JSON (provider-agnostic)

    python3 config_resolver.py --action sync --provider opencode
        → Resolve + format + write to provider config file

    python3 config_resolver.py --action validate
        → Check all secret:KEY references are set in the secrets backend

Environment variables honoured (inherited from bash):
    AGENTS_DIR           Override ~/.agents (used in tests)
    AGENTS_SERVICE       Keychain service name (default: mcpctl)
"""

import argparse
import json
import os
import re
import subprocess
import sys


# ─────────────────────────────────────────────────────────────────────────────
# Config loading
# ─────────────────────────────────────────────────────────────────────────────


def _agents_dir():
    return os.environ.get("AGENTS_DIR", os.path.expanduser("~/.agents"))


def load_user_config(user_config_path):
    """Load config.json with sensible defaults for missing keys."""
    defaults = {
        "paths": {
            "code": "~/Code",
            "documents": "~/Documents",
            "vault": "~/Documents/vault",
        },
        "providers": ["opencode", "claude", "gemini", "codex"],
        "secretsBackend": "auto",
    }
    if os.path.exists(user_config_path):
        with open(user_config_path) as f:
            user = json.load(f)
        # Merge paths (user values override defaults)
        merged_paths = dict(defaults["paths"])
        merged_paths.update(user.get("paths", {}))
        defaults.update(user)
        defaults["paths"] = merged_paths
    return defaults


def load_mcp_config(mcp_path):
    """Load mcp-config.json."""
    with open(mcp_path) as f:
        return json.load(f)


# ─────────────────────────────────────────────────────────────────────────────
# Resolution functions  (shared by ALL providers)
# ─────────────────────────────────────────────────────────────────────────────


def expand_paths(value, paths):
    """
    Expand {{paths.X}} template variables in a string.

    >>> expand_paths("{{paths.code}}/project", {"code": "~/Code"})
    '/Users/alice/Code/project'
    """
    if not isinstance(value, str):
        return value
    for key, path_val in paths.items():
        placeholder = f"{{{{paths.{key}}}}}"
        if placeholder in value:
            value = value.replace(placeholder, os.path.expanduser(str(path_val)))
    return value


def secret_lookup(key, secrets_sh):
    """
    Resolve a single secret key via the mcpctl secrets backend.

    Sources secrets.sh and calls secrets_get <key>. Inherits AGENTS_DIR
    so the correct backend is used in test environments.
    """
    secrets_sh = os.path.expanduser(secrets_sh)
    cmd = f'source "{secrets_sh}" && secrets_get "{key}"'
    # Inherit full environment so AGENTS_DIR, AGENTS_SERVICE etc. flow through
    result = subprocess.run(
        ["bash", "-c", cmd],
        capture_output=True,
        text=True,
        env=dict(os.environ),
    )
    value = result.stdout.strip()
    if not value:
        print(
            f"  WARN: secret '{key}' not found — set it with: mcpctl secrets set {key}",
            file=sys.stderr,
        )
    return value


def resolve_env(env_dict, secrets_sh):
    """Resolve secret:KEY references in an env dict."""
    if not env_dict:
        return {}
    out = {}
    for k, v in env_dict.items():
        if isinstance(v, str) and v.startswith("secret:"):
            out[k] = secret_lookup(v[len("secret:") :], secrets_sh)
        else:
            out[k] = v
    return out


def resolve_headers(headers_dict, secrets_sh):
    """Resolve secret:KEY references inside header string values."""
    if not headers_dict:
        return {}

    def repl(m):
        return secret_lookup(m.group(1), secrets_sh)

    return {k: re.sub(r"secret:([A-Z0-9_]+)", repl, v) for k, v in headers_dict.items()}


def resolve_all_servers(servers, paths, secrets_sh):
    """
    Produce the canonical, provider-agnostic resolved representation.

    All {{paths.X}} are expanded, all secret:KEY references are resolved.
    The output schema mirrors mcp-config.json but with literal values.
    """
    out = {}
    for name, cfg in servers.items():
        entry = dict(cfg)
        # Expand args
        entry["args"] = [expand_paths(a, paths) for a in cfg.get("args", [])]
        if "url" in cfg:
            entry["url"] = expand_paths(cfg["url"], paths)
        if "env" in cfg:
            entry["env"] = resolve_env(cfg["env"], secrets_sh)
        if "headers" in cfg:
            entry["headers"] = resolve_headers(cfg["headers"], secrets_sh)
        out[name] = entry
    return out


# ─────────────────────────────────────────────────────────────────────────────
# Provider registry + generalized formatter
# ─────────────────────────────────────────────────────────────────────────────

_PROVIDERS_JSON = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "providers.json"
)


def load_providers():
    with open(_PROVIDERS_JSON) as f:
        data = json.load(f)
    return {
        k: v for k, v in data.items() if not k.startswith("$") and not k.startswith("_")
    }


def _platform_path(path_spec):
    import platform

    if isinstance(path_spec, str):
        raw = path_spec
    else:
        sys_map = {"Darwin": "darwin", "Linux": "linux", "Windows": "win32"}
        plat = sys_map.get(platform.system(), "linux")
        raw = path_spec.get(plat, path_spec.get("linux", ""))
    return os.path.expanduser(raw.replace("$HOME", "~"))


def format_for_provider(resolved, provider_cfg):
    schema = provider_cfg["configStructure"]
    http_map = schema.get("httpPropertyMapping", {})
    stdio_map = schema.get("stdioPropertyMapping", {})
    out = {}
    for name, cfg in resolved.items():
        entry = {}
        if cfg.get("transport") == "http":
            type_prop = http_map.get("typeProperty")
            if type_prop:
                entry[type_prop] = http_map.get("typeValue", "http")
            url_prop = http_map.get("urlProperty", "url")
            entry[url_prop] = cfg["url"]
            if cfg.get("headers"):
                entry[http_map.get("headersProperty", "headers")] = cfg["headers"]
        else:
            cmd_prop = stdio_map.get("commandProperty", "command")
            args_prop = stdio_map.get("argsProperty", "args")
            env_prop = stdio_map.get("envProperty", "env")
            type_prop = stdio_map.get("typeProperty")
            if type_prop:
                entry[type_prop] = stdio_map.get("typeValue", "stdio")
            if args_prop == cmd_prop:
                entry[cmd_prop] = [cfg["command"]] + cfg.get("args", [])
            else:
                entry[cmd_prop] = cfg["command"]
                entry[args_prop] = cfg.get("args", [])
            if cfg.get("env"):
                entry[env_prop] = cfg["env"]
        out[name] = entry
    return out


# ─────────────────────────────────────────────────────────────────────────────
# Provider sync writers
# ─────────────────────────────────────────────────────────────────────────────


def sync_to_json_file(formatted_servers, config_path, mcp_key, dry_run):
    """Merge formatted servers into an existing JSON config and write it."""
    config_path = os.path.expanduser(config_path)

    if dry_run:
        print(f"  [dry-run] would write '{mcp_key}' block to {config_path}")
        return

    existing = {}
    if os.path.exists(config_path):
        with open(config_path) as f:
            existing = json.load(f)

    existing[mcp_key] = formatted_servers
    os.makedirs(os.path.dirname(config_path), exist_ok=True)
    with open(config_path, "w") as f:
        json.dump(existing, f, indent=2)
        f.write("\n")
    print(f"  wrote {config_path}")


def sync_claude(resolved, dry_run):
    """
    Sync to Claude Code via 'claude mcp add/remove' CLI commands.

    Claude doesn't use a config file — it manages MCP servers through its CLI.
    """
    for name, cfg in resolved.items():
        remove_cmd = ["claude", "mcp", "remove", name, "--scope", "user"]

        if cfg.get("transport") == "http":
            add_cmd = [
                "claude",
                "mcp",
                "add",
                "--transport",
                "http",
                "--scope",
                "user",
                name,
                cfg["url"],
            ]
            for k, v in (cfg.get("headers") or {}).items():
                add_cmd += ["-H", f"{k}: {v}"]
        else:
            add_cmd = ["claude", "mcp", "add", name, "--scope", "user"]
            for k, v in (cfg.get("env") or {}).items():
                add_cmd += ["-e", f"{k}={v}"]
            add_cmd += ["--", cfg["command"]] + cfg.get("args", [])

        if dry_run:
            print(f"  [dry-run] would run: {' '.join(add_cmd)}")
            continue

        subprocess.run(remove_cmd, capture_output=True)
        r = subprocess.run(add_cmd, capture_output=True, text=True)
        if r.returncode == 0:
            print(f"  ok: {name}")
        else:
            print(f"  warn: {name}: {(r.stderr or r.stdout).strip()}", file=sys.stderr)


def write_toml(data, path):
    """
    Minimal stdlib TOML writer.  Handles nested dicts and string/list/bool values.
    No external dependencies — Python 3.6+ only.
    """
    path = os.path.expanduser(path)
    os.makedirs(os.path.dirname(path), exist_ok=True)

    def toml_value(v):
        if isinstance(v, str):
            # Escape backslashes and quotes
            escaped = v.replace("\\", "\\\\").replace('"', '\\"')
            return f'"{escaped}"'
        if isinstance(v, bool):
            return "true" if v else "false"
        if isinstance(v, list):
            items = ", ".join(toml_value(i) for i in v)
            return f"[{items}]"
        return str(v)

    lines = []

    def write_section(prefix, obj):
        scalars = {k: v for k, v in obj.items() if not isinstance(v, dict)}
        nested = {k: v for k, v in obj.items() if isinstance(v, dict)}
        for k, v in scalars.items():
            lines.append(f"{k} = {toml_value(v)}")
        for k, sub in nested.items():
            section = f"{prefix}.{k}" if prefix else k
            lines.append(f"\n[{section}]")
            write_section(section, sub)

    write_section("", data)
    with open(path, "w") as f:
        f.write("\n".join(lines) + "\n")
    print(f"  wrote {path}")


# ─────────────────────────────────────────────────────────────────────────────
# Skills sync
# ─────────────────────────────────────────────────────────────────────────────


def sync_skills(skills_dir, target_dir, provider_name, dry_run):
    """
    Symlink all skills from skills_dir into target_dir.

    Idempotent — skips skills that are already correctly linked.
    """
    skills_dir = os.path.expanduser(skills_dir)
    target_dir = os.path.expanduser(target_dir)

    if not os.path.isdir(skills_dir):
        return

    if not dry_run:
        os.makedirs(target_dir, exist_ok=True)

    skills = [
        d
        for d in os.listdir(skills_dir)
        if os.path.isdir(os.path.join(skills_dir, d))
        and os.path.exists(os.path.join(skills_dir, d, "SKILL.md"))
    ]

    for skill in sorted(skills):
        src = os.path.join(skills_dir, skill)
        dest = os.path.join(target_dir, skill)

        if dry_run:
            print(f"  [dry-run] would symlink {skill} → {dest}")
            continue

        # Already correctly linked
        if os.path.islink(dest) and os.readlink(dest) == src:
            print(f"  already linked: {skill}")
            continue

        if os.path.islink(dest) or os.path.isdir(dest):
            if os.path.isdir(dest) and not os.path.islink(dest):
                import shutil

                shutil.rmtree(dest)
            else:
                os.unlink(dest)

        os.symlink(src, dest)
        print(f"  linked: {skill}")


# ─────────────────────────────────────────────────────────────────────────────
# CLI entry point
# ─────────────────────────────────────────────────────────────────────────────


def _default_secrets_sh():
    """Resolve secrets.sh relative to this script's location."""
    here = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(here, "secrets.sh")


def main():
    agents_dir = _agents_dir()
    _providers = load_providers()

    parser = argparse.ArgumentParser(
        prog="config_resolver.py",
        description="mcpctl shared config resolution and provider sync.",
    )
    parser.add_argument(
        "--action",
        required=True,
        choices=["resolve", "sync", "sync-skills", "validate", "list-providers"],
        help="resolve: output JSON; sync: write to provider; validate: check secrets; list-providers: pipe-delimited provider info for shell loop",
    )
    parser.add_argument(
        "--mcp-config",
        default=os.path.join(agents_dir, "mcp-config.json"),
        help="Path to mcp-config.json",
    )
    parser.add_argument(
        "--user-config",
        default=os.path.join(agents_dir, "config.json"),
        help="Path to config.json",
    )
    parser.add_argument(
        "--secrets-sh", default=_default_secrets_sh(), help="Path to secrets.sh"
    )
    parser.add_argument(
        "--provider",
        choices=list(_providers.keys()),
        help="Target provider (required for --action sync)",
    )
    parser.add_argument(
        "--skills-dir",
        default=os.path.join(agents_dir, "skills"),
        help="Source skills directory (for --action sync-skills)",
    )
    parser.add_argument(
        "--skills-target",
        help="Target directory for skill symlinks (for --action sync-skills)",
    )
    parser.add_argument(
        "--dry-run", action="store_true", help="Preview changes without writing files"
    )
    args = parser.parse_args()

    # ── resolve ───────────────────────────────────────────────────────────────
    if args.action == "resolve":
        user_cfg = load_user_config(args.user_config)
        servers = load_mcp_config(args.mcp_config)
        resolved = resolve_all_servers(servers, user_cfg["paths"], args.secrets_sh)
        print(json.dumps(resolved, indent=2))
        return

    # ── validate ──────────────────────────────────────────────────────────────
    if args.action == "validate":
        servers = load_mcp_config(args.mcp_config)
        raw = json.dumps(servers)
        refs = sorted(set(re.findall(r"secret:([A-Z0-9_]+)", raw)))
        if not refs:
            print("No secret references found.")
            return
        missing = [r for r in refs if not secret_lookup(r, args.secrets_sh)]
        if missing:
            print(
                f"WARNING: {len(missing)} unset secret(s): {', '.join(missing)}",
                file=sys.stderr,
            )
            print("Run: mcpctl secrets set <KEY>  to set each one.", file=sys.stderr)
            sys.exit(1)
        print(f"All {len(refs)} secret reference(s) are set.")
        return

    # ── sync-skills ───────────────────────────────────────────────────────────
    if args.action == "sync-skills":
        if not args.skills_target:
            parser.error("--skills-target required for --action sync-skills")
        sync_skills(
            args.skills_dir,
            args.skills_target,
            args.provider or "unknown",
            args.dry_run,
        )
        return

    # ── list-providers ────────────────────────────────────────────────────────
    if args.action == "list-providers":
        import platform

        sys_map = {"Darwin": "darwin", "Linux": "linux", "Windows": "win32"}
        plat = sys_map.get(platform.system(), "linux")
        user_cfg = load_user_config(args.user_config)
        enabled = user_cfg.get("providers") or list(_providers.keys())
        for pid in enabled:
            if pid not in _providers:
                continue
            p = _providers[pid]
            detect_cmd = p.get("detectCommand", pid)
            skills_spec = p.get("skills", {})
            skills_path = _platform_path(skills_spec.get("path", ""))
            skills_method = skills_spec.get("method", "symlink")
            print(f"{pid}|{detect_cmd}|{skills_path}|{skills_method}")
        return

    # ── sync ──────────────────────────────────────────────────────────────────
    if not args.provider:
        parser.error("--provider required for --action sync")

    user_cfg = load_user_config(args.user_config)
    servers = load_mcp_config(args.mcp_config)
    resolved = resolve_all_servers(servers, user_cfg["paths"], args.secrets_sh)

    provider_cfg = _providers[args.provider]
    config_format = provider_cfg.get("configFormat", "json")

    if config_format == "cli":
        sync_claude(resolved, args.dry_run)
    elif config_format == "toml":
        formatted = format_for_provider(resolved, provider_cfg)
        config_path = _platform_path(provider_cfg["configPath"])
        mcp_key = provider_cfg["configStructure"]["serversPropertyName"]
        if args.dry_run:
            print(f"  [dry-run] would write '{mcp_key}' block to {config_path}")
        else:
            write_toml({mcp_key: formatted}, config_path)
    else:
        formatted = format_for_provider(resolved, provider_cfg)
        config_path = _platform_path(provider_cfg["configPath"])
        mcp_key = provider_cfg["configStructure"]["serversPropertyName"]
        sync_to_json_file(formatted, config_path, mcp_key, args.dry_run)


if __name__ == "__main__":
    main()
