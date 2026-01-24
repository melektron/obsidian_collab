import esbuild from "esbuild";
import process from "process";
import builtins from "builtin-modules";
import copy from "esbuild-plugin-copy";

const banner =
`/*
THIS IS A BUNDLED FILE BY ESBUILD
if you want to view the source, please visit the github repository of this plugin:
https://github.com/melektron/obsidian_collab/
*/
`;

const prod = (process.argv[2] === "production");

const context = await esbuild.context({
	banner: {
		js: banner,
	},
	entryPoints: ["src/main.tsx"],
	bundle: true,
	external: [
		"obsidian",
		"electron",
		"@codemirror/autocomplete",
		"@codemirror/collab",
		"@codemirror/commands",
		"@codemirror/language",
		"@codemirror/lint",
		"@codemirror/search",
		"@codemirror/state",
		"@codemirror/view",
		"@lezer/common",
		"@lezer/highlight",
		"@lezer/lr",
		...builtins],
	format: "cjs",
	target: "es2018",
	logLevel: "info",
	sourcemap: prod ? false : "inline",
	treeShaking: true,
	outfile: "dist/main.js",
	minify: prod,
    plugins: [
        copy({
            resolveFrom: "cwd",
            assets: [
                // if we copy the entire folder contents, watch doesn't work
                {
                    from: ["./static/styles.css"],
                    to: ["./dist/styles.css"],
                    watch: true,
                },
                {
                    from: ["./static/manifest.json"],
                    to: ["./dist/manifest.json"],
                    watch: true,
                },
            ],
            // global watch also doesn't seem to work
            //watch: true,
        })
    ]
});

if (prod) {
	await context.rebuild();
	process.exit(0);
} else {
	await context.watch();
}
