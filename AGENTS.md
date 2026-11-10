# AGENTS.md

You are an expert in JavaScript, Rspeedy, and Lynx application development. You write maintainable, performant, and accessible code.

## Read in Advance

Read docs below in advance to help you understand the library or frameworks this project depends on.

- Lynx: [llms.txt](https://lynxjs.org/llms.txt), **REQUIRED**.
  While dealing with a Lynx task, an agent **MUST** read this doc because it is an entry point of all available docs about Lynx.

## Lynx Docs MCP

For any questions or requirements regarding Lynx:

1. Use the "List Resources Tool" to list all Resources provided in MCP "lynx-docs".
2. First read MCP Resource `lynx-docs://llms.txt` (**REQUIRED**); it is the entry point of all Lynx docs.
3. Use the "Read MCP Resources Tool" to retrieve the docs you need proactively.
4. If available, prefer the MCP Resources tools over external web searches for Lynx information.

## Environment

- Node.js >= 22.15 (v22.23.4 used locally).
- The Lynx MCP servers are pinned to this Node path so they do not depend on the system PATH.

## Lynx DevTool MCP

`lynx-devtool` MCP controls and previews a running Lynx page (elements, console, sources, interactions, screenshots).
It requires a connected device or LynxExplorer session. All DOM/CSS tools are read-only; change the source code instead.

## Skills

Project-level Lynx Agent Skills live in `.trae/skills/`, covering ReactLynx best practices, API docs, CSS support checking, DevTool debugging, TypeScript, lynx-ui, tracing, and bundle size. Load the relevant skill before working on those areas.

## Commands

- `npm run dev` - Start the dev server

- `npm run build` - Build the app for production

- `npm run preview` - Preview the production build locally

- `npm run test` - Run the tests with Rstest

## Related Docs

- Rsbuild: <https://rsbuild.rs/llms.txt>

- Rspack: <https://rspack.rs/llms.txt>
