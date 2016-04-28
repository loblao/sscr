from sscr.texts import formatExpr

import sympy

class BadFormatException(Exception):
    pass
    
def _ensureList(x):
    if isinstance(x, list):
        return x
        
    return [x]
    
def solveEquation(expr):
    expr = expr.replace('^', '**')
    members = expr.split('=')
    if len(members) != 2:
        raise BadFormatException('Bad number of equals.')
            
    from sympy.abc import *
    eq = sympy.Eq(*map(eval, members))
    return [{repr(j): repr(k) for j, k in i.items()} for i in _ensureList(sympy.solve(eq, dict=1))]
    
def solveToText(expr, generator, *args, **kwargs):
    t = '<div class="equation">$%s$<br/>' % formatExpr(expr)
    roots = solveEquation(expr)
    for i, root in enumerate(roots):
        t += ' ,'.join('$%s = %s$' % (r[0], formatExpr(r[1])) for r in root.items())
        if i != len(roots) - 1:
            t += '<br/>or<br/>'

    generator.addP(t + '</div>', doEscape=False)

if __name__ == '__main__':
    import unittest
    
    class TestEquations(unittest.TestCase):
        def test_linear(self):
            self.assertEquals(solveEquation('x = 3'), [{'x': '3'}])
            self.assertEquals(solveEquation('y + 5 = 6'), [{'y': '1'}])
            self.assertEquals(solveEquation('5*x + y = 6*a'), [{'a': '5*x/6 + y/6'}])
            self.assertEquals(solveEquation('x^2 + 4*x = 16'), [{'x': '-2 + 2*sqrt(5)'}, {'x': '-2*sqrt(5) - 2'}])
            self.assertEquals(solveEquation('x^2 + 4*x = -y'), [{'y': '-x*(x + 4)'}])

    unittest.main()
