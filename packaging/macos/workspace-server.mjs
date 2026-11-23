// The Finder launcher opens Safari only after this process owns its stable port.
import {startServer} from './server.mjs';

const server = await startServer(Number(process.argv[2] ?? 18765));
process.stdout.write(`http://127.0.0.1:${server.address().port}/\n`);
// A lost launcher (including a force quit) closes this private pipe.
process.stdin.on('end', () => process.exit(0));
process.stdin.resume();
