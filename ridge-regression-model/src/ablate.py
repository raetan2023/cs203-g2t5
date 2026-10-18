"""Drop one feature group at a time and re-run the walk-forward (same rows)."""
import sys
from .data_loader import load_wide
from .feature_engineering import prepare, FEATURES, GROUPS
from .labels import build_table
from .backtest import walk_forward
from .intervals import add_range
from .metrics import score

if __name__ == "__main__":
    h = int(sys.argv[1]) if len(sys.argv) > 1 else 7
    p = prepare(load_wide()); table = build_table(p, h)
    variants = {"full": FEATURES}
    for g, cols in GROUPS.items():
        variants[f"drop_{g}"] = [f for f in FEATURES if f not in cols]
    variants["only_mgo_history"] = GROUPS["mgo_history"]
    print(f"horizon {h}d, rows {len(table)}")
    for name, feats in variants.items():
        res, _, _ = add_range(walk_forward(table, feats))
        s = score(res)
        print(f"{name:22s} n={s['n']:3d} MAE={s['model_MAE']:.2f} persist={s['persist_MAE']:.2f} skill={s['MAE_skill_vs_persist']:+.3f} RMSE_skill={s['RMSE_skill_vs_persist']:+.3f} dir={s['direction_acc']:.2f}")
