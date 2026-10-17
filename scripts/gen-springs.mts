import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { springsCss } from "../lib/spring-css";

const out = fileURLToPath(new URL("../app/springs.css", import.meta.url));
writeFileSync(out, springsCss());
console.log(`wrote ${out}`);
