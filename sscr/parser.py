from sscr import equations, texts, s3d, matrices

import datetime
import shlex
import sys

class Parser:
    MODE_NONE = 0
    MODE_LIST = 1

    def __init__(self, output):
        self.output = output
        self.traceback = ['root']
        self.calls = {}
        self._line = 0
        self._prevLine = 0
        self._class = ''
        self.__stream = None
        
        self._mode = self.MODE_NONE
        
    def writeMetaData(self):
        data = '<div>'
        data += '<h2 align="center">%s</h2>' % self._class
        data += '<span style="font-size:14px;">Compilation time: %s<br/>' % datetime.datetime.now().strftime('%Y-%B-%d %H:%M:%S')
        data += 'Compilation flags: %s</span>' % ' '.join(sys.argv)
        data += '</div><hr/>'
        self.output.addRaw(data)

    def parse(self, filename):
        if filename in self.traceback:
            self.error(ImportError('circular import'))
        
        self.calls[self.traceback[-1]] = (self.__stream, self._line)
        self.traceback.append(filename)
        self._prevLine = self._line
        self._line = 0

        self.__stream = open(filename, 'rb')        
        while True:
            try:
                line = next(self.__stream)
            
            except StopIteration:
                break
            
            self._line += 1
            line = line.strip('\r\n')
            if line.startswith('//'):
                continue
                
            if line.strip() and not self._class:
                if not line.startswith('@class '):
                    self.error(RuntimeError('first line must be a @class instruction'))
                    
                self._class = line.split(' ', 1)[1]
                self.output.title = self._class
                self.writeMetaData()
                continue
                    
            elif line.startswith('@class '):
                if self.traceback[-2] != 'root':
                    print 'WARNING: @class instruction in included file (%s:%d), ignoring' % (filename, self._line)
                    
                else:
                    self.error(RuntimeError('unexpected @class instruction'))

            if self._mode == self.MODE_LIST:
                if not line.strip():
                    continue

                if not line.lower().startswith('!elist'):
                    self.output.addRaw('<li>')

            if line.startswith('!') and len(line) > 1:
                line = line.split(' ', 1)
                cmd = line[0][1:].lower()
                self.handleCommand(cmd, line[1] if len(line) == 2 else '')
                
            elif line.startswith('+') and len(line) > 1:
                line = line.split(' ')
                script = line[0][1:].lower()
                self.handleScript(script, line[1:])
                
            elif line.startswith('%'):
                i = 0
                while i < len(line) and line[i] == '%':
                    i += 1
                    
                if i > 6:
                    self.error(RuntimeError("Bad number of '%%'s (%d), should be at most 6" % i))
                    
                method = getattr(self.output, 'addH%d' % i)
                line = line[i:].strip()
                center = False
                if line.startswith('/'):
                    line = line[1:].strip()
                    center = True
                
                method(line, center)

            else:
                self.output.addP(line, doFormat=True)
                    
                if self._mode == self.MODE_LIST:
                    self.output.addRaw('</li>')
                    
        self.traceback.pop()
        self._line = self._prevLine
        
        self.__stream.close()
        self.__stream = self.calls.pop(self.traceback[-1])[0]

    def handleCommand(self, cmd, args):
        if self._verifyCmd(cmd, 'eq', args, 1, None, False):
            equations.solveToText(args, self.output)
            
        elif self._verifyCmd(cmd, 'form', args, 1, None, False):
            t = '<div class="formula_box">$%s$<br/></div>' % texts.formatExpr(args)
            self.output.addP(t, doEscape=False)
            
        elif self._verifyCmd(cmd, 'img', args, 1, 3):
            args = shlex.split(args)
            self.output.addImage(*args)
            
        elif self._verifyCmd(cmd, 'hr', args, 0, 0):
            self.output.addHr()
            
        elif self._verifyCmd(cmd, 'include', args, 1, None, False):
            if self._mode != self.MODE_NONE:
                self.error(RuntimeError('!include was unexpected in this state'))
                
            self.parse(args)
            
        elif self._verifyCmd(cmd, 'link', args, 1, None, False):
            args = args.split(' ', 1)
            if len(args) == 1:
                args.append(args[0])
            args = tuple(args)
            self.output.addRaw('<a href="%s">%s</a>' % args)
            
        elif self._verifyCmd(cmd, 'blist', args, 0, 0):
            if self._mode != self.MODE_NONE:
                self.error(ValueError('!blist was unexpected in this state'))
            
            self._mode = self.MODE_LIST
            self.output.addRaw('<ul>')
            
        elif self._verifyCmd(cmd, 'elist', args, 0, 0):
            if self._mode != self.MODE_LIST:
                self.error(ValueError('!elist was unexpected in this state'))
            
            self._mode = self.MODE_NONE
            self.output.addRaw('</ul>')
            
        elif self._verifyCmd(cmd, 'table', args, 1, None):
            args = shlex.split(args)
            cols = args
            
            self.output.addRaw('<table border=1><tr>')
            for col in cols:
                self.output.addRaw('<td>')
                self.output.addP(col)
                self.output.addRaw('</td>')
                
            self.output.addRaw('</tr>')
                
            for line in self.__extractBlock('!table'):
                row = shlex.split(line)
                if len(row) != len(cols):
                    self.error(ValueError('the table has %d cols, however %d were given' % (len(cols), len(row))))
                    
                self.output.addRaw('<tr>')
                for value in row:
                    self.output.addRaw('<td>')
                    self.output.addP(value)
                    self.output.addRaw('</td>')
                
                self.output.addRaw('</tr>')
                
            self.output.addRaw('</table>')
                
        elif self._verifyCmd(cmd, 'table2', args, 1, None):
            args = shlex.split(args)
            cols = args
            
            self.output.addRaw('<table border=1><tr>')
            for col in cols:
                self.output.addRaw('<td>')
                self.output.addP(col, doFormat=True)
                self.output.addRaw('</td>')
                
            self.output.addRaw('</tr>')
                
            for line in self.__extractBlock('!table'):
                row = shlex.split(line)
                if len(row) != len(cols):
                    self.error(ValueError('the table has %d cols, however %d were given' % (len(cols), len(row))))
                    
                self.output.addRaw('<tr>')
                for value in row:
                    self.output.addRaw('<td>')
                    self.output.addP(value, doFormat=True)
                    self.output.addRaw('</td>')
                
                self.output.addRaw('</tr>')
                
            self.output.addRaw('</table>')
            
        elif self._verifyCmd(cmd, 'plot', args, 1, None, False):
            self.output.addPlot(args)
            
        elif self._verifyCmd(cmd, 'plotext', args, 2, None):
            kwargs = self.__parsePlotExtArgs(args)
            self.output.addPlotExt(**kwargs)
            
        elif self._verifyCmd(cmd, 'plotmult', args, 0, 0):
            plots = []
            for line in self.__extractBlock('!plotmult'):
                plot = self.__parsePlotExtArgs(line)
                plots.append(plot)
            
            self.output.addPlotMult(plots)
            
        elif self._verifyCmd(cmd, 'matrix', args, 2, None):
            name, expr = args.split(' ', 1)
            matrices.matrix(name, expr)
            
        elif self._verifyCmd(cmd, 'pmatrix', args, 1, 1):
            name = args
            try:
                matrices.print_matrix(name, self.output)
                
            except KeyError:
                self.error(KeyError('unknown matrix: %s' % name))
                
        elif self._verifyCmd(cmd, 'det', args, 1, 1):
            name = args
            try:
                matrices.det(name, self.output)
                
            except KeyError:
                self.error(KeyError('unknown matrix: %s' % name))
                
        elif self._verifyCmd(cmd, 'invert', args, 1, 1):
            name = args
            try:
                matrices.inv(name, self.output)
                
            except KeyError:
                self.error(KeyError('unknown matrix: %s' % name))
                
        elif self._verifyCmd(cmd, 'transpose', args, 1, 1):
            name = args
            try:
                matrices.transpose(name, self.output)
                
            except KeyError:
                self.error(KeyError('unknown matrix: %s' % name))
        
        else:
            self.error(RuntimeError('%s is not a valid command!' % cmd))
            
    def __extractBlock(self, command, processComments=True):        
        blockStarted = False
        while True:
            try:
                line = next(self.__stream)

            except StopIteration:
                self.error(EOFError('unexpected EOF'))

            self._line += 1
            line = line.strip('\r\n')

            if not blockStarted:
                if line.strip() != '{':
                    self.error('%s requires a block' % command)

                blockStarted = True
                continue

            elif line.strip() == '}':
                break

            if processComments:
                if not line.strip():
                    continue

                if line.startswith('//'):
                    continue

            yield line
            
    def __parsePlotExtArgs(self, args):
        args = shlex.split(args)
        kwargs = {}
        
        for arg in args:
            if '=' not in arg:
                self.error(TypeError('!plotext requires keyword (key=value) arguments'))
                
            arg, value = arg.split('=', 1)
            kwargs[arg] = value
            
        if 'fn' not in kwargs:
            self.error(TypeError('!plotext requires "fn" arg'))
            
        for a in kwargs:
            if a not in ('fn', 'derivative', 'closed'):
                self.error(ValueError('!plotext got an unexpected keyword argument "%s"' % a))
                    
        return kwargs
        
    def handleScript(self, script, args):
        if script == 's2d':
            if len(args) != 2:
                self.error(TypeError('s2d takes 2 arguments (width, height)'))
                
            width, height = args
            try:
                int(width)
                int(height)
                
            except Exception as e:
                self.error(ValueError('s2d requires 2 integers!'))
                
            block = ''
            for line in self.__extractBlock('+s2d', False):
                block += line + '\n'
                
            self.output.addRaw('''
            <script type="text/javascript">
                w = %(width)s;
                h = %(height)s;
                s = Scene2d(w, h);
                %(block)s
            </script>
            ''' % locals())
            
        elif script == 's3d':
            if len(args):
                self.error(TypeError('s3d takes no arguments'))
                
            block = ''
            for line in self.__extractBlock('+s2d', False):
                block += line + '\n'
                
            s3d.executeS3D(block, self.output)

        else:
            self.error(RuntimeError('%s is not a valid script type!' % script))

    def _verifyCmd(self, cmd, expected, args, minArgs=None, maxArgs=None, splitArgs=True):
        if cmd != expected:
            return False
            
        try:
            if minArgs is not None or maxArgs is not None:
                if splitArgs:
                    split = shlex.split(args)
                    
                else:
                    split = [args]
                
                if minArgs != maxArgs:
                    if maxArgs and len(split) > maxArgs:
                        raise TypeError('!%s takes at most %d argument(s) (%d given)' % (cmd.upper(), maxArgs, len(split)))
                        
                    elif minArgs and len(split) < minArgs:
                        raise TypeError('!%s takes at least %d argument(s) (%d given)' % (cmd.upper(), minArgs, len(split)))
                
                elif len(split) != maxArgs:
                    raise TypeError('!%s takes exactly %d argument(s) (%d given)' % (cmd.upper(), maxArgs, len(split)))
                    
        except TypeError as e:
            self.error(e)

        return True
        
    def error(self, e):
        filename = self.traceback[-1]
        print 'Error parsing %s, line %d' % (filename, self._line)
        
        if self.traceback[1:-1]:
            print 'Included from:'
            for filename in self.traceback[1:-1]:
                print '   %s:%d' % (filename, self.calls[filename][1])
                
        print
        
        print '%s: %s' % (e.__class__.__name__, e)
        sys.exit(1)
