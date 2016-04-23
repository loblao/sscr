'''
Use this tool to quickly create your s3d scripts.
Usage:
1 - Copy this file to personal/ (or any other .gitignored directory)
2 - Add your script in the space below.
'''

import sys
sys.path.append('..')

from sscr.s3d import *
s = Scene3D()

# ADD YOUR SCRIPT HERE

base.accept('space', s.oobe)
base.run()
