#!/usr/bin/python -S
"""
hello.py
"""

__author__ = 'Andy Chu'


import sys


class Error(Exception):
  pass


def main(argv):
  """Returns an exit code."""
  print 'Hello from hello.py'
  return 0


if __name__ == '__main__':
  try:
    sys.exit(main(sys.argv))
  except Error, e:
    print >> sys.stderr, e.args[0]
    sys.exit(1)
