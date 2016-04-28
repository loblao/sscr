from sscr import texts

from sympy.matrices import *

import re
RE_MATCH_TAG = re.compile(r'\|(.*?)\|')

MATRIX_CACHE = {}

def _ensureStr(x):
    if isinstance(x, basestring):
        return x
    
    return repr(x)

def matrix(name, expr):
    for i in re.findall(RE_MATCH_TAG, expr):
        expr = expr.replace('|%s|' % i, 'MATRIX_CACHE["%s"]' % i)
    
    from sympy.abc import *
    exec 'MATRIX_CACHE["%s"] = Matrix(%s)' % (name, expr)
    
def print_matrix(name, output, value=None):
    if value is None:
        value = MATRIX_CACHE[name]
        
    shape = value.shape
    o = '$ %s = \\begin{bmatrix}' % name
    for i in xrange(shape[0]):
        o += ' & '.join(texts.formatExpr(_ensureStr(value[i, j])) for j in xrange(shape[1]))
        if i != shape[0]: o += ' \\\\ '
            
    o += ' \\end{bmatrix} $'
    output.addP(o)

def det(name, output):
    m = MATRIX_CACHE[name]
    d = m.det()
    output.addP('$ det(%s) = %s $' % (name, texts.formatExpr(_ensureStr(d))))
    
def inv(name, output):
    m = MATRIX_CACHE[name]
    try:
        inverted = m.inv()
    
    except ValueError:
        output.addP('$ det(%s) = 0, %s^{-1} \ \nexists $' % (name, name))
        return
        
    print_matrix(name + '^{-1}', output, inverted)

def transpose(name, output):
    m = MATRIX_CACHE[name]
    transposed = m.inv()

    print_matrix(name + '^t', output, transposed)
