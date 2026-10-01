// GET /api/x/status: whether Sign in with X is switched on (all three keys are set). The game shows "Connect X" only then.
import { enabled, json } from "../_lib/x.js";
export default function handler(req, res) { json(res, 200, { enabled: enabled() }); }
