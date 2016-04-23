from direct.showbase.ShowBase import ShowBase
from direct.gui.DirectGui import OnscreenText

base = ShowBase()
base.disableMouse()
base.camera.setPos(3, -25, 5)
base.win.setClearColor((.5, .5, .5, 1))

from panda3d.core import *
import random
import math

C_BLACK = (0, 0, 0, 1)
C_WHITE = (1, 1, 1, 1)
C_RED = (1, 0, 0, 1)
C_GREEN = (0, 1, 0, 1)
C_BLUE = (0, 0, 1, 1)

def RC(alpha=1):
    return (random.random(), random.random(), random.random(), alpha)

class Scene3D:    
    def __init__(self):
        for x in render.findAllMatches('**/SPACE'):
            x.removeNode()
        
        Scene3D.SPACE = render.attachNewNode('SPACE')
        
    def text(self, pos, text, h=0, color=C_BLACK):
        t = TextNode('text')
        t.setText(text)
        np = self.SPACE.attachNewNode(t.generate())
        np.setPos(pos)
        np.setTwoSided(1)
        np.setBillboardAxis()
        np.setDepthTest(0)
        np.setDepthWrite(0)
        np.setDepthOffset(500)
        
        if h:
            np.setH(h)
        
        np.setColor(color)
        np.setTransparency(1)
            
        return np
    
    def text2d(self, pos, text, scale=.07, align=TextNode.ALeft, color=C_BLACK):
        t = OnscreenText(text, pos=pos, align=align, fg=color, scale=scale)
        
    def line(self, posList, showDist=None):
        l = LineSegs()

        assert len(posList) > 1
        l.moveTo(posList[0])
        for p in posList[1:]:
            l.drawTo(p)
        
        node = GeomNode('line')
        l.create(node, 0)
        
        np = self.SPACE.attachNewNode(node)

        if showDist is not None:
            for i in xrange(len(posList) - 1):
                a = posList[i]
                b = posList[i + 1]
                midPoint = Point3(*((a[j] + b[j]) / 2 for j in xrange(3)))
                midPoint[2] += .5
                
                dist = ''
                if showDist is True:
                    size = Vec3(Point3(a) - Point3(b)).length()
                    dist = '%.1f' % size
                        
                else:
                    dist = showDist

                self.text(midPoint, dist).setScale(.4)

        return np
        
    def box(self, pos, scale, color=None, solid=False):
        m = loader.loadModel('models/box')
        m.setPos(pos)
        m.setScale(scale)
        
        m.setTextureOff(1)
        if not solid:
            m.setRenderModeWireframe(1)
        if color:
            m.setColor(color)
            
        m.reparentTo(self.SPACE)
        return m
        
    def sphere(self, pos, radius, color=None):
        m = loader.loadModel('models/misc/sphere')
        m.setPos(pos)
        m.setScale(radius)

        if color:
            m.setColor(color)
            m.setTransparency(1)
            
        m.reparentTo(self.SPACE)
        return m
    
    def plane(self, p1, p2, p3, p4, color=None):
        c = CardMaker('cm')
        c.setFrame(p1, p2, p3, p4)
        np = self.SPACE.attachNewNode(c.generate())
        np.setTwoSided(1)
        
        if color:
            np.setColor(color)
            np.setTransparency(1)
        
        return np
    
    def point(self, pos, name):
        self.sphere(pos, .1, C_RED)
        self.text(Point3(pos) + (.1, 0, .3), name).setScale(.6)
    
class Dihedral(NodePath):
    def __init__(self, pos, ang, size=10):
        NodePath.__init__(self, 'Dihedral')
        self.reparentTo(Scene3D.SPACE)
        self.setPos(pos)
        
        self.ang = ang
        self.size = size

        x = size * math.cos(ang * math.pi / 180.0)
        y = size * math.sin(ang * math.pi / 180.0)
        self.pointsA = [(0, 0, 0), (0, size, 0), (size, size, 0), (size, 0, 0)]
        self.pointsB = [(0, 0, 0), (0, size, 0), (x, size, y), (x, 0, y)]

    def render(self, scene, alpha=1): 
        planeA = scene.plane(*self.pointsA, color=RC(alpha))
        planeB = scene.plane(*self.pointsB, color=RC(alpha))
        
        planeA.wrtReparentTo(self)
        planeB.wrtReparentTo(self)

        ind = scene.text((0, .2, .2), 'Dihedral (%d deg)' % self.ang, color=C_WHITE)
        ind.setScale(.5)
        
    def renderBisector(self, scene, alpha=.75):
        ang = self.ang / 2
        size = self.size
        x = size * math.cos(ang * math.pi / 180.0)
        y = size * math.sin(ang * math.pi / 180.0)
        points = [(0, 0, 0), (0, size, 0), (x, size, y), (x, 0, y)]

        plane = scene.plane(*points, color=RC(alpha))
        plane.wrtReparentTo(self)
        
        ind = scene.text((x, size / 2.0, y), 'Bisector', color=C_WHITE)
        ind.setScale(.5)
        
    def getPointOnSurface(self, planeIndex, dist, y=None, scene=None):
        if y is None:
            y = self.size / 2.0
        
        point = [0, y, 0]
        if planeIndex == 0:
            point[0] = dist
            
        else:
            point[0] = dist * math.cos(self.ang * math.pi / 180.0)
            point[2] = dist * math.sin(self.ang * math.pi / 180.0)
            
        point = Point3(*point)
        
        if scene:
            scene.line([(0, y, 0), point], showDist=True)
        
        return point
    
    def getPointOnBisector(self, dist, y=None, scene=None):
        if y is None:
            y = self.size / 2.0

        ang = self.ang / 2
        point = [0, y, 0]
        point[0] = dist * math.cos(ang * math.pi / 180.0)
        point[2] = dist * math.sin(ang * math.pi / 180.0)
        
        point = Point3(*point)
        
        if scene:
            scene.line([(0, y, 0), point], showDist=True)
        
        return point

def executeS3D(_____script, _____output):
    # HACK: Prepend _____ to the paramaters to avoid issues
    # in case those names are used in the script
    s = Scene3D()

    exec _____script
    
    base.graphicsEngine.renderFrame()
    base.win.saveScreenshot(Filename('s3d.png'))
    
    _____output.addImage('s3d.png')
    
    # HACK: Import "os" and "escape" here to avoid issues
    # in case those names are used in the script
    import os
    os.unlink('s3d.png')
    
    from django.utils.html import escape
    uid = os.urandom(6).encode('hex')
    _____output.addRaw('''
    <div class="script" style="display: none;" id="script-%s">
    # s3d script used to generate the pic above:<br/>
    # see util/s3d-sandbox.py for instructions on running this<br/>
    <br/>
    
    %s
    </div>
    <div align="center"><button onclick="showScript('script-%s');">GET SCRIPT</button></div>
    ''' % (uid, escape(_____script).replace('\n', '<br/>'), uid))
