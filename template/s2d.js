function Scene2d(width, height)
{
  function guidGenerator() {
    var S4 = function() {return (((1+Math.random())*0x10000)|0).toString(16).substring(1);};
    return (S4()+S4()+"-"+S4()+"-"+S4()+"-"+S4()+"-"+S4()+S4()+S4());
  }
  target = guidGenerator();
  document.write('<canvas id="' + target + '" width="' + width + '" height="' + height + '"></canvas>')
  cv = document.getElementById(target);
  ctx = cv.getContext('2d');
  var r = {
    set_font: function(font)
    {
        ctx.font = font;
    },
    
    set_color: function(color)
    {
        ctx.fillStyle = color;
        ctx.strokeStyle = color;
    },
    
    line: function(x1, y1, x2, y2)
    {
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
    },
    
    rect: function(x, y, w, h)
    {
        ctx.fillRect(x, y, w, h);
        ctx.stroke();
    },
    
    arc: function(x, y, radius, start, end)
    {
        ctx.beginPath();
        ctx.arc(x, y, radius, start, end, 0);
        ctx.closePath();
        ctx.stroke();
    },
    
    circle: function(x, y, radius)
    {
        this.arc(x, y, radius, 0, 2 * Math.PI);
    },
    
    text: function(x, y, text)
    {
        ctx.fillText(text, x, y);
    },
    
    vector: function(x1, y1, x2, y2)
    {
        this.line(x1, y1, x2, y2);
        
        // evil shit
        theta = Math.atan2(y2 - y1, x2 - x1);
        console.log(theta);
        
        function RAD(v){return v / 180 * Math.PI;}

        if (theta >= RAD(-45) && theta <= RAD(45))
        {
            this.line(x2, y2, x2 - 7, y2 + 7);
            this.line(x2, y2, x2 - 7, y2 - 7);
        }
        
        else if (theta > RAD(45) && theta <= RAD(135))
        {
            this.line(x2, y2, x2 - 7, y2 - 7);
            this.line(x2, y2, x2 + 7, y2 - 7);
        }
        
        else if (theta > RAD(135) && theta <= RAD(225))
        {
            this.line(x2, y2, x2 + 7, y2 + 7);
            this.line(x2, y2, x2 + 7, y2 - 7);
        }
        
        else
        {
            this.line(x2, y2, x2 - 7, y2 + 7);
            this.line(x2, y2, x2 + 7, y2 + 7);
        }
    }
  };
  
  r.set_color('#000000');
  r.set_font('16px Arial');
  r.ctx = ctx;
  return r;
}
