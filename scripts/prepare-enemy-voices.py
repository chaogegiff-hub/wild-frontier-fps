"""Compatibility entry point for the local, instruction-capable voice generator.

Pass --model and --cache as described by prepare-local-combat-voices.py --help.
"""
import pathlib, runpy
runpy.run_path(str(pathlib.Path(__file__).with_name('prepare-local-combat-voices.py')),run_name='__main__')
