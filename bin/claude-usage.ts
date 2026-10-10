#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { buildReport } from "../src/report.ts";

const projectsDir = join(homedir(), ".claude", "projects");
const skillsDir = join(homedir(), ".claude", "skills");
const out = join(import.meta.dirname, "..", "usage.html");

await writeFile(out, await buildReport({ projectsDir, skillsDir, now: new Date() }));
console.log(`file://${out}`);
