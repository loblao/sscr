from django.utils.html import escape

class Table:
    def __init__(self, title=''):
        self.title = title
        self.cols = []
        self.rows = []
        
    def addCol(self, col):
        self.cols.append(col)
        
    def addRow(self, *args):
        self.rows.append(args)
        
    def digest(self, output):
        data = '<div id="table-%s" align="center">' % id(self)
        if self.title:
            data += '<p>%s</p>' % escape(self.title)
        
        data += '<table border=1><tr>'
        for col in self.cols:
            data += '<td>%s</td>' % escape(col)
            
        data += '</tr>'
            
        for row in self.rows:
            data += '<tr>'
            data += ''.join('<td>%s</td>' % escape(x) for x in row)
            data += '</tr>'
        
        data += '</table>'
        output.addRaw(data)
