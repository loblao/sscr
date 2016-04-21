from django.utils.html import escape

import texts
import os

with open('template/template.html', 'rb') as f:
    TemplateData = f.read()
    
with open('template/s2d.js', 'rb') as f:
    s2dData = f.read()

class PageGenerator:
    def __init__(self, title=''):
        self.title = title
        self.body = ''
        
    def addP(self, text, doEscape=True, doFormat=False):
        if doEscape:
            text = escape(text)
            
        if doFormat:
            text = texts.formatText(text)
            
        self.body += '<p>%s</p>' % text
        
    def addH1(self, h1, center=False):
        self.body += '<h1%s>%s</h1>' % (' align="center"' if center else '', escape(h1))
        
    def addH2(self, h2, center=False):
        self.body += '<h2%s>%s</h2>' % (' align="center"' if center else '', escape(h2))
        
    def addH3(self, h3, center=False):
        self.body += '<h3%s>%s</h3>' % (' align="center"' if center else '', escape(h3))
        
    def addH4(self, h4, center=False):
        self.body += '<h4%s>%s</h4>' % (' align="center"' if center else '', escape(h4))
        
    def addH5(self, h5, center=False):
        self.body += '<h5%s>%s</h5>' % (' align="center"' if center else '', escape(h5))
        
    def addH6(self, h6, center=False):
        self.body += '<h6%s>%s</h6>' % (' align="center"' if center else '', escape(h6))

    def addImage(self, filename, width='', height='', align='center'):
        with open(filename, 'rb') as f:
            data = f.read()
            
        self.body += '<div class="image"'
        if align: self.body += ' align="%s"' % align
        self.body += '>'
        self.body += '<image src="data:image/png;base64,%s"' % data.encode('base64').replace('\n', '')
        if width: self.body += ' width="%s"' % width
        if height: self.body += ' height="%s"' % height

        self.body += '></image></div>'
        
    def addHr(self):
        self.body += '<hr/>'
        
    def addRaw(self, data):
        self.body += data
        
    def addPlot(self, fn):
        divId = 'plot-%s' % os.urandom(8).encode('hex')
        
        data = '''
        <div id="%(divId)s"></div>
        <script type="text/javascript">
        functionPlot({
            target: '#%(divId)s',
            data: [{fn: '%(fn)s'}]
        });
        </script>
''' % locals()

        self.body += data
        
    def addPlotExt(self, fn, derivative='', closed=''):
        divId = 'plot-%s' % os.urandom(8).encode('hex')
        
        data = '''
        <div id="%(divId)s"></div>
        <script type="text/javascript">
        functionPlot({
            target: '#%(divId)s',
            title: 'Plot of "%(fn)s"',
            data: [{
                fn: '%(fn)s',
                derivative: {
                    fn: '%(derivative)s',
                    updateOnMouseMove: true
                },
                closed: '%(closed)s'}]
        });
        </script>
''' % locals()

        self.body += data
        
    def addPlotMult(self, plots):
        divId = 'plot-%s' % os.urandom(8).encode('hex')
        
        fndata = []
        
        for plot in plots:
            fn = plot['fn']
            derivative = plot.get('derivative', '')
            closed = plot.get('closed', '')
            
            if derivative:
                fndata.append('''{fn: '%(fn)s', derivative: {
                                  fn: '%(derivative)s', updateOnMouseMove: true},
                                  closed: '%(closed)s'}''' % locals())
                                  
            else:
                fndata.append('''{fn: '%(fn)s', closed: '%(closed)s'}''' % locals())
        
        fndata = ','.join(fndata)

        data = '''
        <div id="%(divId)s"></div>
        <script type="text/javascript">
        functionPlot({
            target: '#%(divId)s',
            data: [%(fndata)s]
        });
        </script>
''' % locals()

        self.body += data

    def output(self):
        return TemplateData % {'title': self.title, 'body': self.body, 's2dData': s2dData}
