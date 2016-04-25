from sscr.html import PageGenerator
from sscr.parser import Parser

import argparse
import glob

parser = argparse.ArgumentParser()
parser.add_argument('--output', '-o', default='output.html',
                    help='Output file.')
parser.add_argument('--verbose', '-v', action='store_true',
                    help='Describe the process.')
parser.add_argument('filenames', nargs='+',
                    help='The raw input file(s). Accepts * and ? as wildcards.')
args = parser.parse_args()

gen = PageGenerator()
p = Parser(gen)

for filename in args.filenames:
    filelist = []
    if '*' in filename or '?' in filename:
        filelist = glob.glob(filename)
    else:
        filelist.append(filename)

    for file in filelist:
        if args.verbose:
            print 'Parsing', file
        p.parse(file)

with open(args.output, 'wb') as f:
    output = gen.output()
    if type(output) == unicode:
        output = output.encode('utf-8')

    f.write(output)
