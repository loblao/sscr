def formatExpr(expr):
    # ** -> ^
    expr = expr.replace('**', '^')
    
    # * can go
    expr = expr.replace('*', '')

    # sqrt(x) -> \sqrt{x}
    while 'sqrt(' in expr:
        a, b = expr.split('sqrt(', 1)
        b, c = b.split(')', 1)
        expr = r'%s\sqrt{%s}%s' % (a, b, c)

    return expr

def formatText(text):
    # _x_ -> <u></u>
    o = ''
    flag = 0
    i = -1
    while i + 1 < len(text):
        i += 1
        x = text[i]
        
        if x == '$':
            i += 1
            o += '$'
            while i < len(text):
                o += text[i]
                i += 1
                if o[-1] == '$':
                    i -= 1
                    break

            continue
            
        if x == '_':
            if flag: o += '</u>'
            else: o += '<u>'
            
            flag = not flag
            
        else:
            o += x
   
    text = o

    # ~x~ -> <strike></strike>
    o = ''
    flag = 0
    i = -1
    while i + 1 < len(text):
        i += 1
        x = text[i]
        
        if x == '$':
            i += 1
            o += '$'
            while i < len(text):
                o += text[i]
                i += 1
                if o[-1] == '$':
                    i -= 1
                    break

            continue
            
        if x == '~':
            if flag: o += '</strike>'
            else: o += '<strike>'

            flag = not flag

        else:
            o += x

    text = o

    # {x} -> <b></b>
    o = ''
    flag = 0
    i = -1
    while i + 1 < len(text):
        i += 1
        x = text[i]
        
        if x == '$':
            i += 1
            o += '$'
            while i < len(text):
                o += text[i]
                i += 1
                if o[-1] == '$':
                    i -= 1
                    break

            continue
            
        if x == '{' and not flag:
            o += '<b>'
            flag = 1

        elif x == '}' and flag:
            o += '</b>'
            flag = 0

        else:
            o += x

    text = o

    # [x] -> <i></i>
    o = ''
    flag = 0
    i = -1
    while i + 1 < len(text):
        i += 1
        x = text[i]
        
        if x == '$':
            i += 1
            o += '$'
            while i < len(text):
                o += text[i]
                i += 1
                if o[-1] == '$':
                    i -= 1
                    break

            continue
            
        if x == '[' and not flag:
            o += '<i>'
            flag = 1

        elif x == ']' and flag:
            o += '</i>'
            flag = 0

        else:
            o += x

    text = o
    
    # |color|X| -> <span style="color: X">X</span>
    o = ''
    flag = 0
    i = -1
    color = ''
    while i + 1 < len(text):
        i += 1
        
        if text[i] == '$':
            i += 1
            o += '$'
            while i < len(text):
                o += text[i]
                i += 1
                if o[-1] == '$':
                    i -= 1
                    break

            continue

        if flag == 0:
            if text[i] == '|':
                flag = 1
                continue
            
            o += text[i]
            
        elif flag == 1:
            if text[i] == '|':
                flag = 2
                o += '<span style="color: %s">' % color
                color = ''
                continue
                
            color += text[i]
            
        elif flag == 2:
            if text[i] == '|':
                flag = 0
                o += '</span>'
                continue
                
            o += text[i]

    text = o

    return text
