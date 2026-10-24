"""Runs the whole UAT suite and writes results.json. Usage: python run_all.py [module ...]"""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import framework  # noqa: E402

MODULES = ["t_core", "t_pricing", "t_orders", "t_finance", "t_services"]
chosen = sys.argv[1:] or MODULES
for name in chosen:
    print(f"\n=== {name} ===")
    __import__(name).run_all()
framework.save(os.path.join(os.path.dirname(__file__), "results.json"))
