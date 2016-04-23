!function(e){if("object"==typeof exports&&"undefined"!=typeof module)module.exports=e();else if("function"==typeof define&&define.amd)define([],e);else{var f;"undefined"!=typeof window?f=window:"undefined"!=typeof global?f=global:"undefined"!=typeof self&&(f=self),f.functionPlot=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
var isObject = require('is-object')

module.exports = function (d) {
  if (!isObject(d)) {
    throw Error('datum is not an object')
  }

  // default graphType uses boxes i.e. 2d intervals
  if (!(d.hasOwnProperty('graphType'))) {
    d.graphType = 'interval'
  }

  // if the graphType is not `interval` then the sampler is `builtIn`
  // because the interval sampler returns a box instead of a point
  if (!(d.hasOwnProperty('sampler'))) {
    d.sampler = d.graphType !== 'interval'
      ? 'builtIn'
      : 'interval'
  }

  // TODO: handle default fnType
  // default `fnType` is linear
  if (!(d.hasOwnProperty('fnType'))) {
    d.fnType = 'linear'
  }

  return d
}


},{"is-object":105}],2:[function(require,module,exports){
/**
 * Created by mauricio on 3/29/15.
 */
'use strict'
var globals = require('./globals')
var evalTypeFn = {
  interval: require('./samplers/interval'),
  builtIn: require('./samplers/builtIn')
}

/**
 * Computes the endpoints x_lo, x_hi of the range
 * from which the sampler will take samples
 *
 * @param {Chart} chart
 * @param {Object} d An item from `data`
 * @returns {Array}
 */
function computeEndpoints (chart, d) {
  var range = d.range || [-Infinity, Infinity]
  var scale = chart.meta.xScale
  var start = Math.max(scale.domain()[0], range[0])
  var end = Math.min(scale.domain()[1], range[1])
  return [start, end]
}

/**
 * Decides which sampler function to call based on the options
 * of `data`
 *
 * @param {Object} chart Chart instance which is orchestating this sampling operation
 * @param {Object} d a.k.a a single item from `data`
 * @returns {Array}
 */
function evaluate (chart, d) {
  var range = computeEndpoints(chart, d)
  var data
  var evalFn = evalTypeFn[d.sampler]
  var nSamples = d.nSamples || Math.min(
    globals.MAX_ITERATIONS,
    globals.DEFAULT_ITERATIONS || (chart.meta.width * 2)
  )
  data = evalFn(chart, d, range, nSamples)
  // NOTE: it's impossible to listen for the first eval event
  // as the event is already fired when a listener is attached
  chart.emit('eval', data, d.index, d.isHelper)
  return data
}

module.exports = evaluate


},{"./globals":3,"./samplers/builtIn":18,"./samplers/interval":19}],3:[function(require,module,exports){
/**
 * Created by mauricio on 3/29/15.
 */
'use strict'

var d3 = window.d3
var Globals = {
  COLORS: [
    'steelblue',
    'red',
    '#05b378',      // green
    'orange',
    '#4040e8',      // purple
    'yellow',
    'brown',
    'magenta',
    'cyan'
  ].map(function (v) {
    return d3.hsl(v)
  }),
  DEFAULT_WIDTH: 550,
  DEFAULT_HEIGHT: 350,
  TIP_X_EPS: 1
}

Globals.DEFAULT_ITERATIONS = null
Globals.MAX_ITERATIONS = Globals.DEFAULT_WIDTH * 4

module.exports = Globals

},{}],4:[function(require,module,exports){
/**
 * Created by mauricio on 4/5/15.
 */
'use strict'
module.exports = {
  polyline: require('./polyline'),
  interval: require('./interval'),
  scatter: require('./scatter')
}

},{"./interval":5,"./polyline":6,"./scatter":7}],5:[function(require,module,exports){
/**
 * Created by mauricio on 3/29/15.
 */
'use strict'
var d3 = window.d3
var evaluate = require('../evaluate')
var utils = require('../utils')

module.exports = function (chart) {
  var minWidthHeight
  var xScale = chart.meta.xScale
  var yScale = chart.meta.yScale

  function clampRange (vLo, vHi, gLo, gHi) {
    var hi = Math.min(vHi, gHi)
    var lo = Math.max(vLo, gLo)
    if (lo > hi) {
      // no overlap
      return [-minWidthHeight, 0]
    }
    return [lo, hi]
  }

  var line = function (points, closed) {
    var path = ''
    var minY = yScale.range()[1]
    var maxY = yScale.range()[0]
    for (var i = 0, length = points.length; i < length; i += 1) {
      if (points[i]) {
        var x = points[i][0]
        var y = points[i][1]
        var yLo = y.lo
        var yHi = y.hi
        // if options.closed is set to true then one of the bounds must be zero
        if (closed) {
          yLo = Math.min(yLo, 0)
          yHi = Math.max(yHi, 0)
        }
        // points.scaledDX is added because of the stroke-width
        var moveX = xScale(x.lo) + points.scaledDx / 2
        var viewportY = clampRange(
          minY, maxY,
          isFinite(yHi) ? yScale(yHi) : -Infinity,
          isFinite(yLo) ? yScale(yLo) : Infinity
        )
        var vLo = viewportY[0]
        var vHi = viewportY[1]
        path += ' M ' + moveX + ' ' + vLo
        path += ' v ' + Math.max(vHi - vLo, minWidthHeight)
      }
    }
    return path
  }

  function plotLine (selection) {
    selection.each(function (d) {
      var el = plotLine.el = d3.select(this)
      var index = d.index
      var closed = d.closed
      var evaluatedData = evaluate(chart, d)
      var innerSelection = el.selectAll(':scope > path.line')
        .data(evaluatedData)

      // the min height/width of the rects drawn by the path generator
      minWidthHeight = Math.max(evaluatedData[0].scaledDx, 1)

      innerSelection.enter()
        .append('path')
        .attr('class', 'line line-' + index)
        .attr('fill', 'none')

      // enter + update
      innerSelection
        .attr('stroke-width', minWidthHeight)
        .attr('stroke', utils.color(d, index))
        .attr('opacity', closed ? 0.5 : 1)
        .attr('d', function (d) {
          return line(d, closed)
        })
        .attr(d.attr)

      innerSelection.exit().remove()
    })
  }

  return plotLine
}

},{"../evaluate":2,"../utils":21}],6:[function(require,module,exports){
/**
 * Created by mauricio on 3/29/15.
 */
'use strict'
var d3 = window.d3
var evaluate = require('../evaluate')
var utils = require('../utils')

module.exports = function (chart) {
  var xScale = chart.meta.xScale
  var yScale = chart.meta.yScale
  var line = d3.svg.line()
    .interpolate('linear')
    .x(function (d) { return xScale(d[0]) })
    .y(function (d) { return yScale(d[1]) })
  var area = d3.svg.area()
    .x(function (d) { return xScale(d[0]) })
    .y0(yScale(0))
    .y1(function (d) { return yScale(d[1]) })

  function plotLine (selection) {

    selection.each(function (d) {
      var el = plotLine.el = d3.select(this)
      var index = d.index
      var evaluatedData = evaluate(chart, d)
      var color = utils.color(d, index)
      var innerSelection = el.selectAll(':scope > path.line')
        .data(evaluatedData)

      innerSelection.enter()
        .append('path')
        .attr('class', 'line line-' + index)
        .attr('stroke-width', 1)
        .attr('stroke-linecap', 'round')

      // enter + update
      innerSelection
        .each(function () {
          var path = d3.select(this)
          var pathD
          if (d.closed) {
            path.attr('fill', color)
            path.attr('fill-opacity', 0.3)
            pathD = area
          } else {
            path.attr('fill', 'none')
            pathD = line
          }
          path
            .attr('stroke', color)
            .attr('marker-end', function () {
              // special marker for vectors
              return d.fnType === 'vector'
                ? 'url(#' + chart.markerId + ')'
                : null
            })
            .attr('d', pathD)
        })
        .attr(d.attr)

      innerSelection.exit().remove()
    })
  }

  return plotLine
}

},{"../evaluate":2,"../utils":21}],7:[function(require,module,exports){
/**
 * Created by mauricio on 3/29/15.
 */
'use strict'
var d3 = window.d3
var evaluate = require('../evaluate')
var utils = require('../utils')

module.exports = function (chart) {
  var xScale = chart.meta.xScale
  var yScale = chart.meta.yScale

  function scatter (selection) {
    selection.each(function (d) {
      var i, j
      var index = d.index
      var color = utils.color(d, index)
      var evaluatedData = evaluate(chart, d)

      // scatter doesn't need groups, therefore each group is
      // flattened into a single array
      var joined = []
      for (i = 0; i < evaluatedData.length; i += 1) {
        for (j = 0; j < evaluatedData[i].length; j += 1) {
          joined.push(evaluatedData[i][j])
        }
      }

      var innerSelection = d3.select(this).selectAll(':scope > circle')
        .data(joined)

      innerSelection.enter()
        .append('circle')

      innerSelection
        .attr('fill', d3.hsl(color.toString()).brighter(1.5))
        .attr('stroke', color)
        .attr('opacity', 0.7)
        .attr('r', 1)
        .attr('cx', function (d) { return xScale(d[0]) })
        .attr('cy', function (d) { return yScale(d[1]) })
        .attr(d.attr)

      innerSelection.exit().remove()
    })
  }

  return scatter
}

},{"../evaluate":2,"../utils":21}],8:[function(require,module,exports){
/**
 * Created by mauricio on 3/29/15.
 */
'use strict'
var d3 = window.d3

module.exports = function (options) {
  var annotations
  var xScale = options.owner.meta.xScale
  var yScale = options.owner.meta.yScale

  var line = d3.svg.line()
    .x(function (d) { return d[0] })
    .y(function (d) { return d[1] })

  annotations = function (parentSelection) {
    parentSelection.each(function () {
      // join
      var current = d3.select(this)
      var selection = current.selectAll('g.annotations')
        .data(function (d) { return d.annotations || [] })

      // enter
      selection.enter()
        .append('g')
        .attr('class', 'annotations')

      // enter + update
      // - path
      var yRange = yScale.range()
      var xRange = xScale.range()
      var path = selection.selectAll('path')
        .data(function (d) {
          if (d.hasOwnProperty('x')) {
            return [ [[0, yRange[0]], [0, yRange[1]]] ]
          } else {
            return [ [[xRange[0], 0], [xRange[1], 0]] ]
          }
        })
      path.enter()
        .append('path')
        .attr('stroke', '#eee')
        .attr('d', line)
      path.exit().remove()

      // enter + update
      // - text
      var text = selection.selectAll('text')
        .data(function (d) {
          return [{
            text: d.text || '',
            hasX: d.hasOwnProperty('x')
          }]
        })
      text.enter()
        .append('text')
        .attr('y', function (d) {
          return d.hasX ? 3 : 0
        })
        .attr('x', function (d) {
          return d.hasX ? 0 : 3
        })
        .attr('dy', function (d) {
          return d.hasX ? 5 : -5
        })
        .attr('text-anchor', function (d) {
          return d.hasX ? 'end' : ''
        })
        .attr('transform', function (d) {
          return d.hasX ? 'rotate(-90)' : ''
        })
        .text(function (d) { return d.text })
      text.exit().remove()

      // enter + update
      // move group
      selection
        .attr('transform', function (d) {
          if (d.hasOwnProperty('x')) {
            return 'translate(' + xScale(d.x) + ', 0)'
          } else {
            return 'translate(0, ' + yScale(d.y) + ')'
          }
        })

      // exit
      selection.exit()
        .remove()
    })
  }

  return annotations
}

},{}],9:[function(require,module,exports){
/**
 * Created by mauricio on 3/29/15.
 */
'use strict'
var d3 = window.d3
var builtInEvaluator = require('./eval').builtIn
var polyline = require('../graph-types/polyline')
var datumDefaults = require('../datum-defaults')

module.exports = function (chart) {
  var derivativeDatum = datumDefaults({
    skipTip: true,
    nSamples: 2,
    graphType: 'polyline'
  })
  var derivative

  function computeLine (d) {
    if (!d.derivative) {
      return []
    }
    var x0 = typeof d.derivative.x0 === 'number' ? d.derivative.x0 : Infinity
    derivativeDatum.index = d.index
    derivativeDatum.scope = {
      m: builtInEvaluator(d.derivative, 'fn', {x: x0}),
      x0: x0,
      y0: builtInEvaluator(d, 'fn', {x: x0})
    }
    derivativeDatum.fn = 'm * (x - x0) + y0'
    return [derivativeDatum]
  }

  function checkAutoUpdate (d) {
    var self = this
    if (!d.derivative) {
      return
    }
    if (d.derivative.updateOnMouseMove && !d.derivative.$$mouseListener) {
      d.derivative.$$mouseListener = function (x0) {
        // update initial value to be the position of the mouse
        // scope's x0 will be updated on the next call to `derivative(self)`
        d.derivative.x0 = x0
        // trigger update (selection = self)
        derivative(self)
      }
      // if d.derivative is destroyed and recreated, the tip:update event
      // will be fired on the new d.derivative :)
      chart.on('tip:update', d.derivative.$$mouseListener)
    }
  }

  derivative = function (selection) {
    selection.each(function (d) {
      var el = d3.select(this)
      var data = computeLine.call(selection, d)
      checkAutoUpdate.call(selection, d)
      var innerSelection = el.selectAll('g.derivative')
        .data(data)

      innerSelection.enter()
        .append('g')
        .attr('class', 'derivative')

      // enter + update
      innerSelection
        .call(polyline(chart))

      // update
      // change the opacity of the line
      innerSelection.selectAll('path')
        .attr('opacity', 0.5)

      innerSelection.exit().remove()
    })
  }

  return derivative
}

},{"../datum-defaults":1,"../graph-types/polyline":6,"./eval":10}],10:[function(require,module,exports){
'use strict'
var samplers = {
  interval: require('interval-arithmetic-eval'),
  builtIn: require('built-in-math-eval')
}
var extend = require('extend')

window.math && (samplers.builtIn = window.math.compile)

function generateEvaluator (samplerName) {
  function doCompile (expression) {
    // compiles does the following
    //
    // when expression === string
    //
    //     gen = new require('math-codegen')
    //     return gen.parse(expression).compile(Interval|BultInMath)
    //
    //     which is an object with the form
    //
    //     {
    //       eval: function (scope) {
    //         // math-codegen magic
    //       }
    //     }
    //
    // when expression === function
    //
    //    {
    //      eval: expression
    //    }
    //
    // othewise throw an error
    if (typeof expression === 'string') {
      var compile = samplers[samplerName]
      return compile(expression)
    } else if (typeof expression === 'function') {
      return { eval: expression }
    } else {
      throw Error('expression must be a string or a function')
    }
  }

  function compileIfPossible (meta, property) {
    // compile the function using interval arithmetic, cache the result
    // so that multiple calls with the same argument don't trigger the
    // kinda expensive compilation process
    var expression = meta[property]
    var hiddenProperty = samplerName + '_Expression_' + property
    var hiddenCompiled = samplerName + '_Compiled_' + property
    if (expression !== meta[hiddenProperty]) {
      meta[hiddenProperty] = expression
      meta[hiddenCompiled] = doCompile(expression)
    }
  }

  function getCompiledExpression (meta, property) {
    return meta[samplerName + '_Compiled_' + property]
  }

  /**
   * Evaluates meta[property] with `variables`
   *
   * - Compiles meta[property] if it wasn't compiled already (also with cache
   *   check)
   * - Evaluates the resulting function with the merge of meta.scope and
   *   `variables`
   *
   * @param {Object} meta
   * @param {String} property
   * @param {Object} variables
   * @returns {Number|Array} The builtIn evaluator returns a number, the
   * interval evaluator an array
   */
  function evaluate (meta, property, variables) {
    // e.g.
    //
    //  meta: {
    //    fn: 'x + 3',
    //    scope: { y: 3 }
    //  }
    //  property: 'fn'
    //  variables:  { x: 3 }
    //
    compileIfPossible(meta, property)

    return getCompiledExpression(meta, property).eval(
      extend({}, meta.scope || {}, variables)
    )
  }

  return evaluate
}

module.exports.builtIn = generateEvaluator('builtIn')
module.exports.interval = generateEvaluator('interval')


},{"built-in-math-eval":22,"extend":54,"interval-arithmetic-eval":56}],11:[function(require,module,exports){
/**
 * Created by mauricio on 4/8/15.
 */
'use strict'
var d3 = window.d3
var derivative = require('./derivative')
var secant = require('./secant')

module.exports = function (chart) {
  function helper (selection) {
    selection.each(function () {
      var el = d3.select(this)
      el.call(derivative(chart))
      el.call(secant(chart))
    })
  }

  return helper
}

},{"./derivative":9,"./secant":12}],12:[function(require,module,exports){
/**
 * Created by mauricio on 3/29/15.
 */
'use strict'
var d3 = window.d3

var extend = require('extend')
var builtInEvaluator = require('./eval').builtIn
var datumDefaults = require('../datum-defaults')
var polyline = require('../graph-types/polyline')

module.exports = function (chart) {
  var secantDefaults = datumDefaults({
    isHelper: true,
    skipTip: true,
    nSamples: 2,
    graphType: 'polyline'
  })
  var secant

  function computeSlope (scope) {
    scope.m = (scope.y1 - scope.y0) / (scope.x1 - scope.x0)
  }

  function updateLine (d, secant) {
    if (!secant.hasOwnProperty('x0')) {
      throw Error('secant must have the property `x0` defined')
    }
    secant.scope = secant.scope || {}

    var x0 = secant.x0
    var x1 = typeof secant.x1 === 'number' ? secant.x1 : Infinity
    extend(secant.scope, {
      x0: x0,
      x1: x1,
      y0: builtInEvaluator(d, 'fn', {x: x0}),
      y1: builtInEvaluator(d, 'fn', {x: x1})
    })
    computeSlope(secant.scope)
  }

  function setFn (d, secant) {
    updateLine(d, secant)
    secant.fn = 'm * (x - x0) + y0'
  }

  function setMouseListener (d, secantObject) {
    var self = this
    if (secantObject.updateOnMouseMove && !secantObject.$$mouseListener) {
      secantObject.$$mouseListener = function (x1) {
        secantObject.x1 = x1
        updateLine(d, secantObject)
        secant(self)
      }
      chart.on('tip:update', secantObject.$$mouseListener)
    }
  }

  function computeLines (d) {
    var self = this
    var data = []
    d.secants = d.secants || []
    for (var i = 0; i < d.secants.length; i += 1) {
      var secant = d.secants[i] = extend({}, secantDefaults, d.secants[i])
      // necessary to make the secant have the same color as d
      secant.index = d.index
      if (!secant.fn) {
        setFn.call(self, d, secant)
        setMouseListener.call(self, d, secant)
      }
      data.push(secant)
    }
    return data
  }

  secant = function (selection) {
    selection.each(function (d) {
      var el = d3.select(this)
      var data = computeLines.call(selection, d)
      var innerSelection = el.selectAll('g.secant')
        .data(data)

      innerSelection.enter()
        .append('g')
        .attr('class', 'secant')

      // enter + update
      innerSelection
        .call(polyline(chart))

      // change the opacity of the secants
      innerSelection.selectAll('path')
        .attr('opacity', 0.5)

      // exit
      innerSelection.exit().remove()
    })
  }

  return secant
}

},{"../datum-defaults":1,"../graph-types/polyline":6,"./eval":10,"extend":54}],13:[function(require,module,exports){
/*
 * function-plot
 *
 * Copyright (c) 2015 Mauricio Poppe
 * Licensed under the MIT license.
 */
'use strict'
require('./polyfills')

var d3 = window.d3

var events = require('events')
var extend = require('extend')

var mousetip = require('./tip')
var helpers = require('./helpers/')
var annotations = require('./helpers/annotations')
var datumDefaults = require('./datum-defaults')

var globals
var graphTypes
var cache = []

module.exports = function (options) {
  options = options || {}
  options.data = options.data || []

  // globals
  var width, height
  var margin
  var zoomBehavior
  var xScale, yScale
  var line = d3.svg.line()
    .x(function (d) { return xScale(d[0]) })
    .y(function (d) { return yScale(d[1]) })

  function Chart () {
    var n = Math.random()
    var letter = String.fromCharCode(Math.floor(n * 26) + 97)
    this.id = options.id = letter + n.toString(16).substr(2)
    this.linkedGraphs = [this]
    this.options = options
    cache[this.id] = this
    this.setUpEventListeners()
  }

  Chart.prototype = Object.create(events.prototype)

  /**
   * Rebuilds the entire graph from scratch recomputing
   *
   * - the inner width/height
   * - scales/axes
   *
   * After this is done it does a complete redraw of all the datums,
   * if only the datums need to be redrawn call `instance.draw()` instead
   *
   * @returns {Chart}
   */
  Chart.prototype.build = function () {
    this.internalVars()
    this.drawGraphWrapper()
    return this
  }

  Chart.prototype.initializeAxes = function () {
    var integerFormat = d3.format('s')
    var format = function (scale) {
      return function (d) {
        var decimalFormat = scale.tickFormat(10)
        var isInteger = d === +d && d === (d | 0)
        // integers: d3.format('s'), see https://github.com/mbostock/d3/wiki/Formatting
        // decimals: default d3.scale.linear() formatting see
        //    https://github.com/mbostock/d3/blob/master/src/svg/axis.js#L29
        return isInteger ? integerFormat(d) : decimalFormat(d)
      }
    }

    function computeYScale (xScale) {
      // assumes that xScale is a linear scale
      var xDiff = xScale[1] - xScale[0]
      return height * xDiff / width
    }

    options.xAxis = options.xAxis || {}
    options.xAxis.type = options.xAxis.type || 'linear'

    options.yAxis = options.yAxis || {}
    options.yAxis.type = options.yAxis.type || 'linear'

    var xDomain = this.meta.xDomain = (function (axis) {
      if (axis.domain) {
        return axis.domain
      }
      if (axis.type === 'linear') {
        var xLimit = 12
        return [-xLimit / 2, xLimit / 2]
      } else if (axis.type === 'log') {
        return [1, 10]
      }
      throw Error('axis type ' + axis.type + ' unsupported')
    })(options.xAxis)

    var yDomain = this.meta.yDomain = (function (axis) {
      if (axis.domain) {
        return axis.domain
      }
      var yLimit = computeYScale(xDomain)
      if (axis.type === 'linear') {
        return [-yLimit / 2, yLimit / 2]
      } else if (axis.type === 'log') {
        return [1, 10]
      }
      throw Error('axis type ' + axis.type + ' unsupported')
    })(options.yAxis)

    if (xDomain[0] >= xDomain[1]) {
      throw Error('the pair defining the x-domain is inverted')
    }
    if (yDomain[0] >= yDomain[1]) {
      throw Error('the pair defining the y-domain is inverted')
    }

    xScale = this.meta.xScale = d3.scale[options.xAxis.type]()
      .domain(xDomain)
      .range([0, width])
    yScale = this.meta.yScale = d3.scale[options.yAxis.type]()
      .domain(yDomain)
      .range([height, 0])
    this.meta.xAxis = d3.svg.axis()
      .scale(xScale)
      .tickSize(options.grid ? -height : 0)
      .tickFormat(format(xScale))
      .orient('bottom')
    this.meta.yAxis = d3.svg.axis()
      .scale(yScale)
      .tickSize(options.grid ? -width : 0)
      .tickFormat(format(yScale))
      .orient('left')
  }

  Chart.prototype.internalVars = function () {
    // measurements and other derived data
    this.meta = {}

    margin = this.meta.margin = {left: 30, right: 30, top: 20, bottom: 20}
    // margin = this.meta.margin = {left: 0, right: 0, top: 20, bottom: 20}
    // if there's a title make the top margin bigger
    if (options.title) {
      this.meta.margin.top = 40
    }

    zoomBehavior = this.meta.zoomBehavior = d3.behavior.zoom()

    // inner width/height
    width = this.meta.width = (options.width || globals.DEFAULT_WIDTH) -
      margin.left - margin.right
    height = this.meta.height = (options.height || globals.DEFAULT_HEIGHT) -
      margin.top - margin.bottom

    this.initializeAxes()
  }

  Chart.prototype.drawGraphWrapper = function () {
    var root = this.root = d3.select(options.target).selectAll('svg')
      .data([options])

    // enter
    this.root.enter = root.enter()
      .append('svg')
      .attr('class', 'function-plot')
      .attr('font-size', this.getFontSize())

    // merge
    root
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)

    this.buildTitle()
    this.buildLegend()
    this.buildCanvas()
    this.buildClip()
    this.buildAxis()
    this.buildAxisLabel()

    // draw each datum after the wrapper was set up
    this.draw()

    // helper to detect the closest fn to the cursor's current abscissa
    var tip = this.tip = mousetip(extend(options.tip, { owner: this }))
    this.canvas
      .call(tip)

    this.buildZoomHelper()
    this.setUpPlugins()
  }

  Chart.prototype.buildTitle = function () {
    // join
    var selection = this.root.selectAll('text.title')
      .data(function (d) {
        return [d.title].filter(Boolean)
      })

    // enter
    selection.enter()
      .append('text')
      .attr('class', 'title')
      .attr('y', margin.top / 2)
      .attr('x', margin.left + width / 2)
      .attr('font-size', 25)
      .attr('text-anchor', 'middle')
      .attr('alignment-baseline', 'middle')
      .text(options.title)

    // exit
    selection.exit().remove()
  }

  Chart.prototype.buildLegend = function () {
    // enter
    this.root.enter
      .append('text')
      .attr('class', 'top-right-legend')
      .attr('text-anchor', 'end')

    // update + enter
    this.root.select('.top-right-legend')
      .attr('y', margin.top / 2)
      .attr('x', width + margin.left)
  }

  Chart.prototype.buildCanvas = function () {
    var self = this

    this.meta.zoomBehavior
      .x(xScale)
      .y(yScale)
      .on('zoom', function onZoom () {
        self.emit('all:zoom', d3.event.translate, d3.event.scale)
      })

    // enter
    var canvas = this.canvas = this.root
      .selectAll('.canvas')
      .data(function (d) { return [d] })

    this.canvas.enter = canvas.enter()
      .append('g')
      .attr('class', 'canvas')

    // enter + update
  }

  Chart.prototype.buildClip = function () {
    // (so that the functions don't overflow on zoom or drag)
    var id = this.id
    var defs = this.canvas.enter.append('defs')
    defs.append('clipPath')
      .attr('id', 'function-plot-clip-' + id)
      .append('rect')
      .attr('class', 'clip static-clip')

    // enter + update
    this.canvas.selectAll('.clip')
      .attr('width', width)
      .attr('height', height)

    // marker clip (for vectors)
    this.markerId = this.id + '-marker'
    defs.append('clipPath')
      .append('marker')
      .attr('id', this.markerId)
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 10)
      .attr('markerWidth', 5)
      .attr('markerHeight', 5)
      .attr('orient', 'auto')
      .append('svg:path')
      .attr('d', 'M0,-5L10,0L0,5L0,0')
      .attr('stroke-width', '0px')
      .attr('fill-opacity', 1)
      .attr('fill', '#777')
  }

  Chart.prototype.buildAxis = function () {
    // axis creation
    var canvasEnter = this.canvas.enter
    canvasEnter.append('g')
      .attr('class', 'x axis')
    canvasEnter.append('g')
      .attr('class', 'y axis')

    // update
    this.canvas.select('.x.axis')
      .attr('transform', 'translate(0,' + height + ')')
      .call(this.meta.xAxis)
    this.canvas.select('.y.axis')
      .call(this.meta.yAxis)

  }

  Chart.prototype.buildAxisLabel = function () {
    // axis labeling
    var xLabel, yLabel
    var canvas = this.canvas

    xLabel = canvas.selectAll('text.x.axis-label')
      .data(function (d) {
        return [d.xAxis.label].filter(Boolean)
      })
    xLabel.enter()
      .append('text')
      .attr('class', 'x axis-label')
      .attr('text-anchor', 'end')
    xLabel
      .attr('x', width)
      .attr('y', height - 6)
      .text(function (d) { return d })
    xLabel.exit().remove()

    yLabel = canvas.selectAll('text.y.axis-label')
      .data(function (d) {
        return [d.yAxis.label].filter(Boolean)
      })
    yLabel.enter()
      .append('text')
      .attr('class', 'y axis-label')
      .attr('y', 6)
      .attr('dy', '.75em')
      .attr('text-anchor', 'end')
      .attr('transform', 'rotate(-90)')
    yLabel
      .text(function (d) { return d })
    yLabel.exit().remove()
  }

  /**
   * @private
   *
   * Draws each of the datums stored in data.options, to do a full
   * redraw call `instance.draw()`
   */
  Chart.prototype.buildContent = function () {
    var self = this
    var canvas = this.canvas

    canvas
      .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')')
      .call(zoomBehavior)
      .each(function () {
        var el = d3.select(this)
        // make a copy of all the listeners available to be removed/added later
        var listeners = ['mousedown', 'mousewheel', 'mouseover', 'DOMMouseScroll', 'dblclick', 'wheel', 'MozMousePixelScroll']
        listeners = listeners.map(function (l) { return l + '.zoom' })
        if (!el._hasZoomListeners) {
          listeners.forEach(function (l) {
            el['_' + l] = el.on(l)
          })
        }
        function setState (state) {
          listeners.forEach(function (l) {
            state ? el.on(l, el['_' + l]) : el.on(l, null)
          })
        }
        setState(!options.disableZoom)
      })

    var content = this.content = canvas.selectAll(':scope > g.content')
      .data(function (d) { return [d] })

    // g tag clipped to hold the data
    content.enter()
      .append('g')
      .attr('clip-path', 'url(#function-plot-clip-' + this.id + ')')
      .attr('class', 'content')

    // helper line, x = 0
    if (options.xAxis.type === 'linear') {
      var yOrigin = content.selectAll(':scope > path.y.origin')
      .data([ [[0, yScale.domain()[0]], [0, yScale.domain()[1]]] ])
      yOrigin.enter()
      .append('path')
      .attr('class', 'y origin')
      .attr('stroke', 'black')
      .attr('opacity', 0.2)
      yOrigin.attr('d', line)
    }

    // helper line y = 0
    if (options.yAxis.type === 'linear') {
      var xOrigin = content.selectAll(':scope > path.x.origin')
        .data([ [[xScale.domain()[0], 0], [xScale.domain()[1], 0]] ])
      xOrigin.enter()
        .append('path')
        .attr('class', 'x origin')
        .attr('stroke', 'black')
        .attr('opacity', 0.2)
      xOrigin.attr('d', line)
    }

    // annotations
    content
      .call(annotations({ owner: self }))

    // content construction
    // - join options.data to <g class='graph'> elements
    // - for each datum determine the sampler to use
    var graphs = content.selectAll(':scope > g.graph')
      .data(function (d) {
        return d.data.map(datumDefaults)
      })

    // enter
    graphs
      .enter()
      .append('g')
      .attr('class', 'graph')

    // enter + update
    graphs
      .each(function (d, index) {
        // additional options needed in the graph-types/helpers
        d.index = index

        d3.select(this)
          .call(graphTypes[d.graphType](self))
        d3.select(this)
          .call(helpers(self))
      })
  }

  Chart.prototype.buildZoomHelper = function () {
    // dummy rect (detects the zoom + drag)
    var self = this

    // enter
    this.draggable = this.canvas.enter
      .append('rect')
      .attr('class', 'zoom-and-drag')
      .style('fill', 'none')
      .style('pointer-events', 'all')

    // update
    this.canvas.select('.zoom-and-drag')
      .attr('width', width)
      .attr('height', height)
      .on('mouseover', function () {
        self.emit('all:mouseover')
      })
      .on('mouseout', function () {
        self.emit('all:mouseout')
      })
      .on('mousemove', function () {
        self.emit('all:mousemove')
      })
  }

  Chart.prototype.setUpPlugins = function () {
    var plugins = options.plugins || []
    var self = this
    plugins.forEach(function (plugin) {
      plugin(self)
    })
  }

  Chart.prototype.addLink = function () {
    for (var i = 0; i < arguments.length; i += 1) {
      this.linkedGraphs.push(arguments[i])
    }
  }

  Chart.prototype.updateAxes = function () {
    var instance = this
    var canvas = instance.canvas
    canvas.select('.x.axis').call(instance.meta.xAxis)
    canvas.select('.y.axis').call(instance.meta.yAxis)

    // updates the style of the axes
    canvas.selectAll('.axis path, .axis line')
      .attr('fill', 'none')
      .attr('stroke', 'black')
      .attr('shape-rendering', 'crispedges')
      .attr('opacity', 0.1)
  }

  Chart.prototype.syncOptions = function () {
    // update the original options yDomain and xDomain
    this.options.xAxis.domain = this.meta.xScale.domain()
    this.options.yAxis.domain = this.meta.yScale.domain()
  }

  Chart.prototype.programmaticZoom = function (xDomain, yDomain) {
    var instance = this
    d3.transition()
      .duration(750)
      .tween('zoom', function () {
        var ix = d3.interpolate(xScale.domain(), xDomain)
        var iy = d3.interpolate(yScale.domain(), yDomain)
        return function (t) {
          zoomBehavior
            .x(xScale.domain(ix(t)))
            .y(yScale.domain(iy(t)))
          instance.draw()
        }
      })
      .each('end', function () {
        instance.emit('programmatic-zoom')
      })
  }

  Chart.prototype.getFontSize = function () {
    return Math.max(Math.max(width, height) / 50, 8)
  }

  Chart.prototype.draw = function () {
    var instance = this
    instance.emit('before:draw')
    instance.syncOptions()
    instance.updateAxes()
    instance.buildContent()
    instance.emit('after:draw')
  }

  Chart.prototype.setUpEventListeners = function () {
    var instance = this

    var events = {
      mousemove: function (coordinates) {
        instance.tip.move(coordinates)
      },

      mouseover: function () {
        instance.tip.show()
      },

      mouseout: function () {
        instance.tip.hide()
      },

      zoom: function (translate, scale) {
        zoomBehavior
          .translate(translate)
          .scale(scale)
      },

      'tip:update': function (x, y, index) {
        var meta = instance.root.datum().data[index]
        var title = meta.title || ''
        var format = meta.renderer || function (x, y) {
            return x.toFixed(3) + ', ' + y.toFixed(3)
          }

        var text = []
        title && text.push(title)
        text.push(format(x, y))

        instance.root.select('.top-right-legend')
          .attr('fill', globals.COLORS[index])
          .text(text.join(' '))
      }

    }

    var all = {
      mousemove: function () {
        var mouse = d3.mouse(instance.root.select('rect.zoom-and-drag').node())
        var coordinates = {
          x: xScale.invert(mouse[0]),
          y: yScale.invert(mouse[1])
        }
        instance.linkedGraphs.forEach(function (graph) {
          graph.emit('before:mousemove', coordinates)
          graph.emit('mousemove', coordinates)
        })
      },

      zoom: function (translate, scale) {
        instance.linkedGraphs.forEach(function (graph, i) {
          graph.emit('zoom', translate, scale)
          graph.draw()
        })

        // emit the position of the mouse to all the registered graphs
        instance.emit('all:mousemove')
      }

    }

    Object.keys(events).forEach(function (e) {
      instance.on(e, events[e])
      // create an event for each event existing on `events` in the form 'all:' event
      // e.g. all:mouseover all:mouseout
      // the objective is that all the linked graphs receive the same event as the current graph
      !all[e] && instance.on('all:' + e, function () {
        var args = Array.prototype.slice.call(arguments)
        instance.linkedGraphs.forEach(function (graph) {
          var localArgs = args.slice()
          localArgs.unshift(e)
          graph.emit.apply(graph, localArgs)
        })
      })
    })

    Object.keys(all).forEach(function (e) {
      instance.on('all:' + e, all[e])
    })
  }

  var instance = cache[options.id]
  if (!instance) {
    instance = new Chart()
  }
  return instance.build()
}
globals = module.exports.globals = require('./globals')
graphTypes = module.exports.graphTypes = require('./graph-types/')
module.exports.plugins = require('./plugins/')
module.exports.eval = require('./helpers/eval')

},{"./datum-defaults":1,"./globals":3,"./graph-types/":4,"./helpers/":11,"./helpers/annotations":8,"./helpers/eval":10,"./plugins/":15,"./polyfills":17,"./tip":20,"events":117,"extend":54}],14:[function(require,module,exports){
var d3 = window.d3
var extend = require('extend')
var pressed = require('key-pressed')
var keydown = require('keydown')
var integrateSimpson = require('integrate-adaptive-simpson')
module.exports = function (options) {
  options = extend({
    key: '<shift>',
    // true to make the brush mask visible/hidden on keydown
    // by default the mask will be visible only when the `key`
    // combination is pressed
    toggle: false
  }, options)

  var brush = d3.svg.brush()
  var kd = keydown(options.key)
  var visible = false
  var cachedInstance

  // the integrator module requires a function with a single parameter x
  function wrapper (datum) {
    return function (x) {
      var functionPlot = window.functionPlot
      return functionPlot.eval.builtIn(datum, 'fn', {x: x})
    }
  }

  function setBrushState (visible) {
    var brushEl = cachedInstance.canvas.selectAll('.definite-integral')
    brushEl.style('display', visible ? null : 'none')
  }

  function inner (instance) {
    cachedInstance = instance
    // update the brush scale with the instance scale
    var oldDisableZoom
    brush
      .x(instance.meta.xScale)
      .on('brushstart', function () {
        if (!d3.event.sourceEvent) return
        oldDisableZoom = !!instance.options.disableZoom
        instance.options.disableZoom = true
        // replot the samples with the option disableZoom set to true
        instance.emit('draw')
      })
      .on('brushend', function () {
        if (!d3.event.sourceEvent) return
        instance.options.disableZoom = oldDisableZoom

        if (!brush.empty()) {
          var a = brush.extent()[0]
          var b = brush.extent()[1]
          // iterate the data finding the value of the definite integral
          // with bounds `a` and `b`
          instance.options.data.forEach(function (datum, i) {
            var value = integrateSimpson(wrapper(datum), a, b, options.tol, options.maxdepth)
            instance.emit('definite-integral', datum, i, value, a, b)
          })
        }
        // replot the samples with the option disableZoom set to whatever it was before
        instance.draw()
      })
    var brushEl = instance.canvas.append('g').attr('class', 'brush definite-integral')
    brushEl
      .call(brush)
      .call(brush.event)

    instance.canvas.selectAll('.brush .extent')
      .attr('stroke', '#fff')
      .attr('fill-opacity', 0.125)
      .attr('shape-rendering', 'crispEdges')

    brushEl.selectAll('rect')
      .attr('height', instance.meta.height)

    instance.canvas
      .on('mousemove.definiteIntegral', function () {
        // options.toggle sets the mask visibility when all the required
        // are pressed once and it's not disabled on keyup
        if (!options.toggle) {
          inner.visible(pressed(options.key))
        }
      })
    kd.on('pressed', function () {
      inner.visible(options.toggle ? !inner.visible() : true)
    })
    inner.visible(false)
  }

  inner.visible = function (_) {
    if (!arguments.length) {
      return visible
    }
    visible = _
    setBrushState(_)
    return inner
  }

  return inner
}

},{"extend":54,"integrate-adaptive-simpson":55,"key-pressed":106,"keydown":108}],15:[function(require,module,exports){
module.exports = {
  zoomBox: require('./zoom-box'),
  definiteIntegral: require('./definite-integral')
}

},{"./definite-integral":14,"./zoom-box":16}],16:[function(require,module,exports){
var d3 = window.d3
var extend = require('extend')
var pressed = require('key-pressed')
var keydown = require('keydown')
module.exports = function (options) {
  options = extend({
    key: '<shift>',
    // true to make the brush mask visible/hidden on keydown
    // by default the mask will be visible only when the `key`
    // combination is pressed
    toggle: false
  }, options)

  var brush = d3.svg.brush()
  var kd = keydown(options.key)
  var cachedInstance
  var visible = false

  function setBrushState (visible) {
    var brushEl = cachedInstance.canvas.selectAll('.zoom-box')
    brushEl.style('display', visible ? null : 'none')
  }

  function inner (instance) {
    cachedInstance = instance
    // update the brush scale with the instance scale
    var oldDisableZoom
    brush
      .x(instance.meta.xScale)
      .y(instance.meta.yScale)
      .on('brushstart', function () {
        if (!d3.event.sourceEvent) return
        oldDisableZoom = !!instance.options.disableZoom
        instance.options.disableZoom = true
        // redrawing the canvas with the option disableZoom set to true
        instance.draw()
      })
      .on('brushend', function () {
        if (!d3.event.sourceEvent) return
        instance.options.disableZoom = oldDisableZoom

        if (!brush.empty()) {
          var lo = brush.extent()[0]
          var hi = brush.extent()[1]
          var x = [lo[0], hi[0]]
          var y = [lo[1], hi[1]]
          instance.programmaticZoom(x, y)
        }
        d3.select(this)
          .transition()
          .duration(1)
          .call(brush.clear())
          .call(brush.event)
      })
    var brushEl = instance.canvas.append('g').attr('class', 'brush zoom-box')
    brushEl
      .call(brush)
      .call(brush.event)

    instance.canvas.selectAll('.brush .extent')
      .attr('stroke', '#fff')
      .attr('fill-opacity', 0.125)
      .attr('shape-rendering', 'crispEdges')

    instance.canvas
      .on('mousemove.zoombox', function () {
        // options.toggle sets the mask visibility when all the required
        // are pressed once and it's not disabled on keyup
        if (!options.toggle) {
          inner.visible(pressed(options.key))
        }
      })
    kd.on('pressed', function () {
      inner.visible(options.toggle ? !inner.visible() : true)
    })
    inner.visible(false)
  }

  inner.visible = function (_) {
    if (!arguments.length) {
      return visible
    }
    visible = _
    setBrushState(_)
    return inner
  }

  return inner
}

},{"extend":54,"key-pressed":106,"keydown":108}],17:[function(require,module,exports){
// issue: https://github.com/maurizzzio/function-plot/issues/6
// solution: the line type is selecting the derivative line when the content is re-drawn, then when the
// derivative was redrawn an already selected line (by the line type) was used thus making a single line
// disappear from the graph, to avoid the selection of the derivative line the selector needs to
// work only for immediate children which is done with `:scope >`
// src: http://stackoverflow.com/questions/6481612/queryselector-search-immediate-children
/*eslint-disable */
;(function (doc, proto) {
  try { // check if browser supports :scope natively
    doc.querySelector(':scope body')
  } catch (err) { // polyfill native methods if it doesn't
    ['querySelector', 'querySelectorAll'].forEach(function (method) {
      var native = proto[method]
      proto[method] = function (selectors) {
        if (/(^|,)\s*:scope/.test(selectors)) { // only if selectors contains :scope
          var id = this.id // remember current element id
          this.id = 'ID_' + Date.now() // assign new unique id
          selectors = selectors.replace(/((^|,)\s*):scope/g, '$1#' + this.id); // replace :scope with #ID
          var result = doc[method](selectors)
          this.id = id // restore previous id
          return result
        } else {
          return native.call(this, selectors) // use native code for other selectors
        }
      }
    })
  }
})(window.document, Element.prototype)
/*eslint-enable */

},{}],18:[function(require,module,exports){
'use strict'
var clamp = require('clamp')
var linspace = require('linspace')

var utils = require('../utils')
var evaluate = require('../helpers/eval').builtIn

function checkAsymptote (d0, d1, meta, sign, level) {
  if (!level) {
    return {
      asymptote: true,
      d0: d0,
      d1: d1
    }
  }
  var i
  var n = 10
  var x0 = d0[0]
  var x1 = d1[0]
  var samples = linspace(x0, x1, n)
  var oldY, oldX
  for (i = 0; i < n; i += 1) {
    var x = samples[i]
    var y = evaluate(meta, 'fn', {x: x})

    if (i) {
      var deltaY = y - oldY
      var newSign = utils.sgn(deltaY)
      if (newSign === sign) {
        return checkAsymptote([oldX, oldY], [x, y], meta, sign, level - 1)
      }
    }
    oldY = y
    oldX = x
  }
  return {
    asymptote: false,
    d0: d0,
    d1: d1
  }
}

/**
 * Splits the evaluated data into arrays, each array is separated by any asymptote found
 * through the process of detecting slope/sign brusque changes
 * @param chart
 * @param data
 * @returns {Array[]}
 */
function split (chart, meta, data) {
  var i, oldSign
  var deltaX
  var st = []
  var sets = []
  var domain = chart.meta.yScale.domain()
  var zoomScale = chart.meta.zoomBehavior.scale()
  var yMin = domain[0]
  var yMax = domain[1]

  if (data[0]) {
    st.push(data[0])
    deltaX = data[1][0] - data[0][0]
    oldSign = utils.sgn(data[1][1] - data[0][1])
  }

  function updateY (d) {
    d[1] = Math.min(d[1], yMax)
    d[1] = Math.max(d[1], yMin)
    return d
  }

  i = 1
  while (i < data.length) {
    var y0 = data[i - 1][1]
    var y1 = data[i][1]
    var deltaY = y1 - y0
    var newSign = utils.sgn(deltaY)
    // make a new set if:
    if (// utils.sgn(y1) * utils.sgn(y0) < 0 && // there's a change in the evaluated values sign
      // there's a change in the slope sign
      oldSign !== newSign &&
      // the slope is bigger to some value (according to the current zoom scale)
      Math.abs(deltaY / deltaX) > 1 / zoomScale) {
      // retest this section again and determine if it's an asymptote
      var check = checkAsymptote(data[i - 1], data[i], meta, newSign, 3)
      if (check.asymptote) {
        st.push(updateY(check.d0))
        sets.push(st)
        st = [updateY(check.d1)]
      }
    }
    oldSign = newSign
    st.push(data[i])
    ++i
  }

  if (st.length) {
    sets.push(st)
  }

  return sets
}

function linear (chart, meta, range, n) {
  var allX = utils.space(chart, range, n)
  var yDomain = chart.meta.yScale.domain()
  var yDomainMargin = (yDomain[1] - yDomain[0])
  var yMin = yDomain[0] - yDomainMargin * 1e5
  var yMax = yDomain[1] + yDomainMargin * 1e5
  var data = []
  var i
  for (i = 0; i < allX.length; i += 1) {
    var x = allX[i]
    var y = evaluate(meta, 'fn', {x: x})
    if (utils.isValidNumber(x) && utils.isValidNumber(y)) {
      data.push([x, clamp(y, yMin, yMax)])
    }
  }
  data = split(chart, meta, data)
  return data
}

function parametric (chart, meta, range, nSamples) {
  // range is mapped to canvas coordinates from the input
  // for parametric plots the range will tell the start/end points of the `t` param
  var parametricRange = meta.range || [0, 2 * Math.PI]
  var tCoords = utils.space(chart, parametricRange, nSamples)
  var samples = []
  for (var i = 0; i < tCoords.length; i += 1) {
    var t = tCoords[i]
    var x = evaluate(meta, 'x', {t: t})
    var y = evaluate(meta, 'y', {t: t})
    samples.push([x, y])
  }
  return [samples]
}

function polar (chart, meta, range, nSamples) {
  // range is mapped to canvas coordinates from the input
  // for polar plots the range will tell the start/end points of the `theta` param
  var polarRange = meta.range || [-Math.PI, Math.PI]
  var thetaSamples = utils.space(chart, polarRange, nSamples)
  var samples = []
  for (var i = 0; i < thetaSamples.length; i += 1) {
    var theta = thetaSamples[i]
    var r = evaluate(meta, 'r', {theta: theta})
    var x = r * Math.cos(theta)
    var y = r * Math.sin(theta)
    samples.push([x, y])
  }
  return [samples]
}

function points (chart, meta, range, nSamples) {
  return [meta.points]
}

function vector (chart, meta, range, nSamples) {
  meta.offset = meta.offset || [0, 0]
  return [[
    meta.offset,
    [meta.vector[0] + meta.offset[0], meta.vector[1] + meta.offset[1]]
  ]]
}

var sampler = function (chart, d, range, nSamples) {
  var fnTypes = {
    parametric: parametric,
    polar: polar,
    points: points,
    vector: vector,
    linear: linear
  }
  if (!(d.fnType in fnTypes)) {
    throw Error(d.fnType + ' is not supported in the `builtIn` sampler')
  }
  return fnTypes[d.fnType].apply(null, arguments)
}

module.exports = sampler

},{"../helpers/eval":10,"../utils":21,"clamp":53,"linspace":110}],19:[function(require,module,exports){
/**
 * Created by mauricio on 5/14/15.
 */
'use strict'
var intervalArithmeticEval = require('interval-arithmetic-eval')
var Interval = intervalArithmeticEval.Interval

var evaluate = require('../helpers/eval').interval
var utils = require('../utils')

// disable the use of typed arrays in interval-arithmetic to improve the performance
intervalArithmeticEval.policies.disableRounding()

function interval1d (chart, meta, range, nSamples) {
  var xCoords = utils.space(chart, range, nSamples)
  var xScale = chart.meta.xScale
  var yScale = chart.meta.yScale
  var yMin = yScale.domain()[0]
  var yMax = yScale.domain()[1]
  var samples = []
  var i
  for (i = 0; i < xCoords.length - 1; i += 1) {
    var x = {lo: xCoords[i], hi: xCoords[i + 1]}
    var y = evaluate(meta, 'fn', {x: x})
    if (!Interval.isEmpty(y) && !Interval.isWhole(y)) {
      samples.push([x, y])
    }
    if (Interval.isWhole(y)) {
      // means that the next and prev intervals need to be fixed
      samples.push(null)
    }
  }

  // asymptote determination
  for (i = 1; i < samples.length - 1; i += 1) {
    if (!samples[i]) {
      var prev = samples[i - 1]
      var next = samples[i + 1]
      if (prev && next && !Interval.intervalsOverlap(prev[1], next[1])) {
        // case:
        //
        //   |
        //
        //     |
        //
        //   p n
        if (prev[1].lo > next[1].hi) {
          prev[1].hi = Math.max(yMax, prev[1].hi)
          next[1].lo = Math.min(yMin, next[1].lo)
        }
        // case:
        //
        //     |
        //
        //   |
        //
        //   p n
        if (prev[1].hi < next[1].lo) {
          prev[1].lo = Math.min(yMin, prev[1].lo)
          next[1].hi = Math.max(yMax, next[1].hi)
        }
      }
    }
  }

  samples.scaledDx = xScale(xCoords[1]) - xScale(xCoords[0])
  return [samples]
}

var rectEps
function smallRect (x, y) {
  return Interval.width(x) < rectEps
}

function quadTree (x, y, meta) {
  var sample = evaluate(meta, 'fn', {
    x: x,
    y: y
  })
  var fulfills = Interval.zeroIn(sample)
  if (!fulfills) { return this }
  if (smallRect(x, y)) {
    this.push([x, y])
    return this
  }
  var midX = x.lo + (x.hi - x.lo) / 2
  var midY = y.lo + (y.hi - y.lo) / 2
  var east = {lo: midX, hi: x.hi}
  var west = {lo: x.lo, hi: midX}
  var north = {lo: midY, hi: y.hi}
  var south = {lo: y.lo, hi: midY}

  quadTree.call(this, east, north, meta)
  quadTree.call(this, east, south, meta)
  quadTree.call(this, west, north, meta)
  quadTree.call(this, west, south, meta)
}

function interval2d (chart, meta) {
  var xScale = chart.meta.xScale
  var xDomain = chart.meta.xScale.domain()
  var yDomain = chart.meta.yScale.domain()
  var x = {lo: xDomain[0], hi: xDomain[1]}
  var y = {lo: yDomain[0], hi: yDomain[1]}
  var samples = []
  // 1 px
  rectEps = xScale.invert(1) - xScale.invert(0)
  quadTree.call(samples, x, y, meta)
  samples.scaledDx = 1
  return [samples]
}

var sampler = function (chart, d, range, nSamples) {
  var fnTypes = {
    implicit: interval2d,
    linear: interval1d
  }
  if (!(fnTypes.hasOwnProperty(d.fnType))) {
    throw Error(d.fnType + ' is not supported in the `interval` sampler')
  }
  return fnTypes[d.fnType].apply(null, arguments)
}

module.exports = sampler

},{"../helpers/eval":10,"../utils":21,"interval-arithmetic-eval":56}],20:[function(require,module,exports){
/**
 * Created by mauricio on 3/29/15.
 */
'use strict'
var d3 = window.d3
var extend = require('extend')
var utils = require('./utils')
var clamp = require('clamp')
var globals = require('./globals')
var builtInEvaluator = require('./helpers/eval').builtIn

module.exports = function (config) {
  config = extend({
    xLine: false,
    yLine: false,
    renderer: function (x, y) {
      return '(' + x.toFixed(3) + ', ' + y.toFixed(3) + ')'
    },
    owner: null
  }, config)

  var MARGIN = 20

  var line = d3.svg.line()
    .x(function (d) { return d[0] })
    .y(function (d) { return d[1] })

  function lineGenerator (el, data) {
    return el.append('path')
      .datum(data)
      .attr('stroke', 'grey')
      .attr('stroke-dasharray', '5,5')
      .attr('opacity', 0.5)
      .attr('d', line)
  }

  function tip (selection) {
    var innerSelection = selection.selectAll('g.tip')
      .data(function (d) { return [d] })

    // enter
    innerSelection
      .enter().append('g')
      .attr('class', 'tip')
      .attr('clip-path', 'url(#function-plot-clip-' + config.owner.id + ')')

    // enter + update = enter inner tip
    tip.el = innerSelection.selectAll('g.inner-tip')
      .data(function (d) {
        // debugger
        return [d]
      })

    tip.el.enter()
      .append('g')
      .attr('class', 'inner-tip')
      .style('display', 'none')
      .each(function () {
        var el = d3.select(this)
        lineGenerator(el, [[0, -config.owner.meta.height - MARGIN], [0, config.owner.meta.height + MARGIN]])
          .attr('class', 'tip-x-line')
          .style('display', 'none')
        lineGenerator(el, [[-config.owner.meta.width - MARGIN, 0], [config.owner.meta.width + MARGIN, 0]])
          .attr('class', 'tip-y-line')
          .style('display', 'none')
        el.append('circle').attr('r', 3)
        el.append('text').attr('transform', 'translate(5,-5)')
      })

    // enter + update
    selection.selectAll('.tip-x-line').style('display', config.xLine ? null : 'none')
    selection.selectAll('.tip-y-line').style('display', config.yLine ? null : 'none')
  }

  tip.move = function (coordinates) {
    var i
    var minDist = Infinity
    var closestIndex = -1
    var x, y

    var el = tip.el
    var inf = 1e8
    var meta = config.owner.meta
    var data = el.data()[0].data
    var xScale = meta.xScale
    var yScale = meta.yScale
    var width = meta.width
    var height = meta.height

    var x0 = coordinates.x
    var y0 = coordinates.y

    for (i = 0; i < data.length; i += 1) {
      // skipTip=true skips the evaluation in the datum
      // implicit equations cannot be evaluated with a single point
      // parametric equations cannot be evaluated with a single point
      // polar equations cannot be evaluated with a single point
      if (data[i].skipTip || data[i].fnType !== 'linear') {
        continue
      }

      var range = data[i].range || [-inf, inf]
      if (x0 > range[0] - globals.TIP_X_EPS && x0 < range[1] + globals.TIP_X_EPS) {
        try {
          var candidateY = builtInEvaluator(data[i], 'fn', {x: x0})
        } catch (e) { }
        if (utils.isValidNumber(candidateY)) {
          var tDist = Math.abs(candidateY - y0)
          if (tDist < minDist) {
            minDist = tDist
            closestIndex = i
          }
        }
      }
    }

    if (closestIndex !== -1) {
      x = x0
      if (data[closestIndex].range) {
        x = Math.max(x, data[closestIndex].range[0])
        x = Math.min(x, data[closestIndex].range[1])
      }
      y = builtInEvaluator(data[closestIndex], 'fn', {x: x})

      tip.show()
      config.owner.emit('tip:update', x, y, closestIndex)
      var clampX = clamp(x, xScale.invert(-MARGIN), xScale.invert(width + MARGIN))
      var clampY = clamp(y, yScale.invert(height + MARGIN), yScale.invert(-MARGIN))
      var color = utils.color(data[closestIndex], closestIndex)
      el.attr('transform', 'translate(' + xScale(clampX) + ',' + yScale(clampY) + ')')
      el.select('circle')
        .attr('fill', color)
      el.select('text')
        .attr('fill', color)
        .text(config.renderer(x, y))
    } else {
      tip.hide()
    }
  }

  tip.show = function () {
    this.el.style('display', null)
  }

  tip.hide = function () {
    this.el.style('display', 'none')
  }
  // generations of getters/setters
  Object.keys(config).forEach(function (option) {
    utils.getterSetter.call(tip, config, option)
  })

  return tip
}

},{"./globals":3,"./helpers/eval":10,"./utils":21,"clamp":53,"extend":54}],21:[function(require,module,exports){
/**
 * Created by mauricio on 3/29/15.
 */
'use strict'
var linspace = require('linspace')
var logspace = require('logspace')
var log10 = require('log10')

var globals = require('./globals')

module.exports = {
  isValidNumber: function (v) {
    return typeof v === 'number' && !isNaN(v)
  },

  space: function (chart, range, n) {
    var lo = range[0]
    var hi = range[1]
    if (chart.options.xAxis.type === 'log') {
      return logspace(log10(lo), log10(hi), n)
    }
    // default is linear
    return linspace(lo, hi, n)
  },

  getterSetter: function (config, option) {
    var me = this
    this[option] = function (value) {
      if (!arguments.length) {
        return config[option]
      }
      config[option] = value
      return me
    }
  },

  sgn: function (v) {
    if (v < 0) { return -1 }
    if (v > 0) { return 1 }
    return 0
  },

  color: function (data, index) {
    return data.color || globals.COLORS[index]
  }
}

},{"./globals":3,"linspace":110,"log10":112,"logspace":113}],22:[function(require,module,exports){
/*
 * built-in-math-eval
 *
 * Copyright (c) 2015 Mauricio Poppe
 * Licensed under the MIT license.
 */

'use strict'

module.exports = require('./lib/eval')

},{"./lib/eval":24}],23:[function(require,module,exports){
'use strict'
module.exports = function () {
  var math = Object.create(Math)

  math.factory = function (a) {
    if (typeof a !== 'number') {
      throw new TypeError('built-in math factory only accepts numbers')
    }
    return Number(a)
  }

  math.add = function (a, b) {
    return a + b
  }
  math.sub = function (a, b) {
    return a - b
  }
  math.mul = function (a, b) {
    return a * b
  }
  math.div = function (a, b) {
    return a / b
  }
  math.mod = function (a, b) {
    return a % b
  }
  math.factorial = function (a) {
    var res = 1
    for (var i = 2; i <= a; i += 1) {
      res *= i
    }
    return res
  }

  // taken from https://github.com/josdejong/mathjs/blob/master/lib/function/arithmetic/nthRoot.js
  math.nthRoot = function (a, root) {
    var inv = root < 0
    if (inv) {
      root = -root
    }

    if (root === 0) {
      throw new Error('Root must be non-zero')
    }
    if (a < 0 && (Math.abs(root) % 2 !== 1)) {
      throw new Error('Root must be odd when a is negative.')
    }

    // edge cases zero and infinity
    if (a === 0) {
      return 0
    }
    if (!isFinite(a)) {
      return inv ? 0 : a
    }

    var x = Math.pow(Math.abs(a), 1 / root)
    // If a < 0, we require that root is an odd integer,
    // so (-1) ^ (1/root) = -1
    x = a < 0 ? -x : x
    return inv ? 1 / x : x
  }

  // logical
  math.logicalOR = function (a, b) {
    return a || b
  }
  math.logicalXOR = function (a, b) {
    /* eslint-disable */
    return a != b
    /* eslint-enable*/
  }
  math.logicalAND = function (a, b) {
    return a && b
  }

  // bitwise
  math.bitwiseOR = function (a, b) {
    /* eslint-disable */
    return a | b
    /* eslint-enable*/
  }
  math.bitwiseXOR = function (a, b) {
    /* eslint-disable */
    return a ^ b
    /* eslint-enable*/
  }
  math.bitwiseAND = function (a, b) {
    /* eslint-disable */
    return a & b
    /* eslint-enable*/
  }

  // relational
  math.lessThan = function (a, b) {
    return a < b
  }
  math.lessEqualThan = function (a, b) {
    return a <= b
  }
  math.greaterThan = function (a, b) {
    return a > b
  }
  math.greaterEqualThan = function (a, b) {
    return a >= b
  }
  math.equal = function (a, b) {
    /* eslint-disable */
    return a == b
  /* eslint-enable*/
  }
  math.strictlyEqual = function (a, b) {
    return a === b
  }
  math.notEqual = function (a, b) {
    /* eslint-disable */
    return a != b
  /* eslint-enable*/
  }
  math.strictlyNotEqual = function (a, b) {
    return a !== b
  }

  // shift
  math.shiftRight = function (a, b) {
    return (a >> b)
  }
  math.shiftLeft = function (a, b) {
    return (a << b)
  }
  math.unsignedRightShift = function (a, b) {
    return (a >>> b)
  }

  // unary
  math.negative = function (a) {
    return -a
  }
  math.positive = function (a) {
    return a
  }

  return math
}

},{}],24:[function(require,module,exports){
'use strict'

var CodeGenerator = require('math-codegen')
var math = require('./adapter')()

function processScope (scope) {
  Object.keys(scope).forEach(function (k) {
    var value = scope[k]
    scope[k] = math.factory(value)
  })
}

module.exports = function (expression) {
  return new CodeGenerator()
    .setDefs({
      $$processScope: processScope
    })
    .parse(expression)
    .compile(math)
}

module.exports.math = math

},{"./adapter":23,"math-codegen":25}],25:[function(require,module,exports){
/*
 * math-codegen
 *
 * Copyright (c) 2015 Mauricio Poppe
 * Licensed under the MIT license.
 */
'use strict'
module.exports = require('./lib/CodeGenerator')

},{"./lib/CodeGenerator":26}],26:[function(require,module,exports){
'use strict'

var Parser = require('mr-parser').Parser
var Interpreter = require('./Interpreter')
var extend = require('extend')

function CodeGenerator (options, defs) {
  this.statements = []
  this.defs = defs || {}
  this.interpreter = new Interpreter(this, options)
}

CodeGenerator.prototype.setDefs = function (defs) {
  this.defs = extend(this.defs, defs)
  return this
}

CodeGenerator.prototype.compile = function (namespace) {
  if (!namespace || !(typeof namespace === 'object' || typeof namespace === 'function')) {
    throw TypeError('namespace must be an object')
  }
  if (typeof namespace.factory !== 'function') {
    throw TypeError('namespace.factory must be a function')
  }

  // definitions available in the function
  // each property under this.defs is mapped to local variables
  // e.g
  //
  //  function (defs) {
  //    var ns = defs['ns']
  //    // code generated for the expression
  //  }
  this.defs.ns = namespace
  this.defs.$$mathCodegen = {
    getProperty: function (symbol, scope, ns) {
      if (symbol in scope) {
        return scope[symbol]
      }
      if (symbol in ns) {
        return ns[symbol]
      }
      throw SyntaxError('symbol "' + symbol + '" is undefined')
    },
    functionProxy: function (fn, name) {
      if (typeof fn !== 'function') {
        throw SyntaxError('symbol "' + name + '" must be a function')
      }
      return fn
    }
  }
  this.defs.$$processScope = this.defs.$$processScope || function () {}

  var defsCode = Object.keys(this.defs).map(function (name) {
    return 'var ' + name + ' = defs["' + name + '"]'
  })

  // statement join
  if (!this.statements.length) {
    throw Error('there are no statements saved in this generator, make sure you parse an expression before compiling it')
  }

  // last statement is always a return statement
  this.statements[this.statements.length - 1] = 'return ' + this.statements[this.statements.length - 1]

  var code = this.statements.join(';')
  var factoryCode = defsCode.join('\n') + '\n' + [
    'return {',
    '  eval: function (scope) {',
    '    scope = scope || {}',
    '    $$processScope(scope)',
    '    ' + code,
    '  },',
    "  code: '" + code + "'",
    '}'
  ].join('\n')

  /* eslint-disable */
  var factory = new Function('defs', factoryCode)
  return factory(this.defs)
  /* eslint-enable */
}

CodeGenerator.prototype.parse = function (code) {
  var self = this
  var program = new Parser().parse(code)
  this.statements = program.blocks.map(function (statement) {
    return self.interpreter.next(statement)
  })
  return this
}

module.exports = CodeGenerator

},{"./Interpreter":27,"extend":54,"mr-parser":38}],27:[function(require,module,exports){
'use strict'
var extend = require('extend')

var types = {
  ArrayNode: require('./node/ArrayNode'),
  AssignmentNode: require('./node/AssignmentNode'),
  ConditionalNode: require('./node/ConditionalNode'),
  ConstantNode: require('./node/ConstantNode'),
  FunctionNode: require('./node/FunctionNode'),
  OperatorNode: require('./node/OperatorNode'),
  SymbolNode: require('./node/SymbolNode'),
  UnaryNode: require('./node/UnaryNode')
}

var Interpreter = function (owner, options) {
  this.owner = owner
  this.options = extend({
    factory: 'ns.factory',
    raw: false,
    rawArrayExpressionElements: true,
    rawCallExpressionElements: false
  }, options)
}

extend(Interpreter.prototype, types)

// main method which decides which expression to call
Interpreter.prototype.next = function (node) {
  if (!(node.type in this)) {
    throw new TypeError('the node type ' + node.type + ' is not implemented')
  }
  return this[node.type](node)
}

Interpreter.prototype.rawify = function (test, fn) {
  var oldRaw = this.options.raw
  if (test) {
    this.options.raw = true
  }
  fn()
  if (test) {
    this.options.raw = oldRaw
  }
}

module.exports = Interpreter

},{"./node/ArrayNode":30,"./node/AssignmentNode":31,"./node/ConditionalNode":32,"./node/ConstantNode":33,"./node/FunctionNode":34,"./node/OperatorNode":35,"./node/SymbolNode":36,"./node/UnaryNode":37,"extend":54}],28:[function(require,module,exports){
'use strict'

module.exports = {
  // arithmetic
  '+': 'add',
  '-': 'sub',
  '*': 'mul',
  '/': 'div',
  '^': 'pow',
  '%': 'mod',
  '!': 'factorial',

  // misc operators
  '|': 'bitwiseOR',       // bitwise or
  '^|': 'bitwiseXOR',     // bitwise xor
  '&': 'bitwiseAND',      // bitwise and

  '||': 'logicalOR',      // logical or
  'xor': 'logicalXOR',    // logical xor
  '&&': 'logicalAND',     // logical and

  // comparison
  '<': 'lessThan',
  '>': 'greaterThan',
  '<=': 'lessEqualThan',
  '>=': 'greaterEqualThan',
  '===': 'strictlyEqual',
  '==': 'equal',
  '!==': 'strictlyNotEqual',
  '!=': 'notEqual',

  // shift
  '>>': 'shiftRight',
  '<<': 'shiftLeft',
  '>>>': 'unsignedRightShift'
}

},{}],29:[function(require,module,exports){
'use strict'

module.exports = {
  '+': 'positive',
  '-': 'negative',
  '~': 'oneComplement'
}

},{}],30:[function(require,module,exports){
'use strict'
module.exports = function (node) {
  var self = this
  var arr = []
  this.rawify(this.options.rawArrayExpressionElements, function () {
    arr = node.nodes.map(function (el) {
      return self.next(el)
    })
  })
  var arrString = '[' + arr.join(',') + ']'

  if (this.options.raw) {
    return arrString
  }
  return this.options.factory + '(' + arrString + ')'
}

},{}],31:[function(require,module,exports){
'use strict'

module.exports = function (node) {
  return 'scope["' + node.name + '"] = ' + this.next(node.expr)
}

},{}],32:[function(require,module,exports){
'use strict'

module.exports = function (node) {
  var condition = '!!(' + this.next(node.condition) + ')'
  var trueExpr = this.next(node.trueExpr)
  var falseExpr = this.next(node.falseExpr)
  return '(' + condition + ' ? (' + trueExpr + ') : (' + falseExpr + ') )'
}

},{}],33:[function(require,module,exports){
'use strict'
module.exports = function (node) {
  if (this.options.raw) {
    return node.value
  }
  return this.options.factory + '(' + node.value + ')'
}

},{}],34:[function(require,module,exports){
'use strict'
var SymbolNode = require('mr-parser').nodeTypes.SymbolNode

var functionProxy = function (node) {
  return '$$mathCodegen.functionProxy(' + this.next(new SymbolNode(node.name)) + ', "' + node.name + '")'
}

module.exports = function (node) {
  var self = this
  // wrap in a helper function to detect the type of symbol it must be a function
  // NOTE: if successful the wrapper returns the function itself
  // NOTE: node.name should be a symbol so that it's correctly represented as a string in SymbolNode
  var method = functionProxy.call(this, node)
  var args = []
  this.rawify(this.options.rawCallExpressionElements, function () {
    args = node.args.map(function (arg) {
      return self.next(arg)
    })
  })
  return method + '(' + args.join(', ') + ')'
}

module.exports.functionProxy = functionProxy

},{"mr-parser":38}],35:[function(require,module,exports){
'use strict'

var Operators = require('../misc/Operators')

module.exports = function (node) {
  if (this.options.raw) {
    return ['(' + this.next(node.args[0]), node.op, this.next(node.args[1]) + ')'].join(' ')
  }

  var namedOperator = Operators[node.op]

  if (!namedOperator) {
    throw TypeError('unidentified operator')
  }

  /* eslint-disable new-cap */
  return this.FunctionNode({
    name: namedOperator,
    args: node.args
  })
  /* eslint-enable new-cap */
}

},{"../misc/Operators":28}],36:[function(require,module,exports){
'use strict'

module.exports = function (node) {
  var id = node.name
  return '$$mathCodegen.getProperty("' + id + '", scope, ns)'
}

},{}],37:[function(require,module,exports){
'use strict'

var UnaryOperators = require('../misc/UnaryOperators')

module.exports = function (node) {
  if (this.options.raw) {
    return node.op + this.next(node.argument)
  }

  if (!(node.op in UnaryOperators)) {
    throw new SyntaxError(node.op + ' not implemented')
  }

  var namedOperator = UnaryOperators[node.op]
  /* eslint-disable new-cap */
  return this.FunctionNode({
    name: namedOperator,
    args: [node.argument]
  })
  /* eslint-enable new-cap */
}

},{"../misc/UnaryOperators":29}],38:[function(require,module,exports){
/*
 * mr-parser
 *
 * Copyright (c) 2015 Mauricio Poppe
 * Licensed under the MIT license.
 */

'use strict'

module.exports.Lexer = require('./lib/Lexer')
module.exports.Parser = require('./lib/Parser')
module.exports.nodeTypes = require('./lib/node/')

},{"./lib/Lexer":39,"./lib/Parser":40,"./lib/node/":51}],39:[function(require,module,exports){
// token types
var tokenType = require('./token-type')

var ESCAPES = {
  'n': '\n',
  'f': '\f',
  'r': '\r',
  't': '\t',
  'v': '\v',
  '\'': '\'',
  '"': '"'
}

var DELIMITERS = {
  ',': true,
  '(': true,
  ')': true,
  '[': true,
  ']': true,
  ';': true,

  // unary
  '~': true,

  // factorial
  '!': true,

  // arithmetic operators
  '+': true,
  '-': true,
  '*': true,
  '/': true,
  '%': true,
  '^': true,
  '**': true,     // python power like

  // misc operators
  '|': true,      // bitwise or
  '&': true,      // bitwise and
  '^|': true,     // bitwise xor
  '=': true,
  ':': true,
  '?': true,

  '||': true,      // logical or
  '&&': true,      // logical and
  'xor': true,     // logical xor

  // relational
  '==': true,
  '!=': true,
  '===': true,
  '!==': true,
  '<': true,
  '>': true,
  '>=': true,
  '<=': true,

  // shifts
  '>>>': true,
  '<<': true,
  '>>': true
}

// helpers

function isDigit (c) {
  return c >= '0' && c <= '9'
}

function isIdentifier (c) {
  return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') ||
    c === '$' || c === '_'
}

function isWhitespace (c) {
  return c === ' ' || c === '\r' || c === '\t' ||
    c === '\n' || c === '\v' || c === '\u00A0'
}

function isDelimiter (str) {
  return DELIMITERS[str]
}

function isQuote (c) {
  return c === '\'' || c === '"'
}

// lexer

function Lexer () {}

Lexer.prototype.throwError = function (message, index) {
  index = typeof index === 'undefined' ? this.index : index

  var error = new Error(message + ' at index ' + index)
  error.index = index
  error.description = message
  throw error
}

Lexer.prototype.lex = function (text) {
  this.text = text
  this.index = 0
  this.tokens = []

  while (this.index < this.text.length) {
    // skip whitespaces
    while (isWhitespace(this.peek())) {
      this.consume()
    }
    var c = this.peek()
    var c2 = c + this.peek(1)
    var c3 = c2 + this.peek(2)

    // order
    // - delimiter of 3 characters
    // - delimiter of 2 characters
    // - delimiter of 1 character
    // - number
    // - variables, functions and named operators
    if (isDelimiter(c3)) {
      this.tokens.push({
        type: tokenType.DELIMITER,
        value: c3
      })
      this.consume()
      this.consume()
      this.consume()
    } else if (isDelimiter(c2)) {
      this.tokens.push({
        type: tokenType.DELIMITER,
        value: c2
      })
      this.consume()
      this.consume()
    } else if (isDelimiter(c)) {
      this.tokens.push({
        type: tokenType.DELIMITER,
        value: c
      })
      this.consume()
    } else if (isDigit(c) ||
        (c === '.' && isDigit(this.peek(1)))) {
      this.tokens.push({
        type: tokenType.NUMBER,
        value: this.readNumber()
      })
    } else if (isQuote(c)) {
      this.tokens.push({
        type: tokenType.STRING,
        value: this.readString()
      })
    } else if (isIdentifier(c)) {
      this.tokens.push({
        type: tokenType.SYMBOL,
        value: this.readIdentifier()
      })
    } else {
      this.throwError('unexpected character ' + c)
    }
  }

  // end token
  this.tokens.push({ type: tokenType.EOF })

  return this.tokens
}

Lexer.prototype.peek = function (nth) {
  nth = nth || 0
  if (this.index + nth >= this.text.length) {
    return
  }
  return this.text.charAt(this.index + nth)
}

Lexer.prototype.consume = function () {
  var current = this.peek()
  this.index += 1
  return current
}

Lexer.prototype.readNumber = function () {
  var number = ''

  if (this.peek() === '.') {
    number += this.consume()
    if (!isDigit(this.peek())) {
      this.throwError('number expected')
    }
  } else {
    while (isDigit(this.peek())) {
      number += this.consume()
    }
    if (this.peek() === '.') {
      number += this.consume()
    }
  }

  // numbers after the decimal dot
  while (isDigit(this.peek())) {
    number += this.consume()
  }

  // exponent if available
  if ((this.peek() === 'e' || this.peek() === 'E')) {
    number += this.consume()

    if (!(isDigit(this.peek()) ||
        this.peek() === '+' ||
        this.peek() === '-')) {
      this.throwError()
    }

    if (this.peek() === '+' || this.peek() === '-') {
      number += this.consume()
    }

    if (!isDigit(this.peek())) {
      this.throwError('number expected')
    }

    while (isDigit(this.peek())) {
      number += this.consume()
    }
  }
  return number
}

Lexer.prototype.readIdentifier = function () {
  var text = ''
  while (isIdentifier(this.peek()) || isDigit(this.peek())) {
    text += this.consume()
  }
  return text
}

Lexer.prototype.readString = function () {
  var quote = this.consume()
  var string = ''
  var escape
  while (true) {
    var c = this.consume()
    if (!c) {
      this.throwError('string is not closed')
    }
    if (escape) {
      if (c === 'u') {
        var hex = this.text.substring(this.index + 1, this.index + 5)
        if (!hex.match(/[\da-f]{4}/i)) {
          this.throwError('invalid unicode escape')
        }
        this.index += 4
        string += String.fromCharCode(parseInt(hex, 16))
      } else {
        var replacement = ESCAPES[c]
        if (replacement) {
          string += replacement
        } else {
          string += c
        }
      }
      escape = false
    } else if (c === quote) {
      break
    } else if (c === '\\') {
      escape = true
    } else {
      string += c
    }
  }
  return string
}

module.exports = Lexer

},{"./token-type":52}],40:[function(require,module,exports){
var tokenType = require('./token-type')

var Lexer = require('./Lexer')
var ConstantNode = require('./node/ConstantNode')
var OperatorNode = require('./node/OperatorNode')
var UnaryNode = require('./node/UnaryNode')
var SymbolNode = require('./node/SymbolNode')
var FunctionNode = require('./node/FunctionNode')
var ArrayNode = require('./node/ArrayNode')
var ConditionalNode = require('./node/ConditionalNode')
var AssignmentNode = require('./node/AssignmentNode')
var BlockNode = require('./node/BlockNode')

/**
 * Grammar DSL:
 *
 * program          : block (; block)*
 *
 * block            : assignment
 *
 * assignment       : ternary
 *                  | symbol `=` assignment
 *
 * ternary          : logicalOR
 *                  | logicalOR `?` ternary `:` ternary
 *
 * logicalOR        : logicalXOR
 *                  | logicalXOR (`||`,`or`) logicalOR
 *
 * logicalXOR       : logicalAND
 *                  : logicalAND `xor` logicalXOR
 *
 * logicalAND       : bitwiseOR
 *                  | bitwiseOR (`&&`,`and`) logicalAND
 *
 * bitwiseOR        : bitwiseXOR
 *                  | bitwiseXOR `|` bitwiseOR
 *
 * bitwiseXOR       : bitwiseAND
 *                  | bitwiseAND `^|` bitwiseXOR
 *
 * bitwiseAND       : relational
 *                  | relational `&` bitwiseAND
 *
 * relational       : shift
 *                  | shift (`!=` | `==` | `>` | '<' | '<=' |'>=') shift)
 *
 * shift            : additive
 *                  | additive (`>>` | `<<` | `>>>`) shift
 *
 * additive         : multiplicative
 *                  | multiplicative (`+` | `-`) additive
 *
 * multiplicative   : unary
 *                  | unary (`*` | `/` | `%`) unary
 *                  | unary symbol
 *
 * unary            : pow
 *                  | (`-` | `+` | `~`) unary
 *
 * pow              : factorial
 *                  | factorial (`^`, '**') unary
 *
 * factorial        : symbol
 *                  | symbol (`!`)
 *
 * symbol           : symbolToken
 *                  | symbolToken functionCall
 *                  | string
 *
 * functionCall     : `(` `)`
 *                  | `(` ternary (, ternary)* `)`
 *
 * string           : `'` (character)* `'`
 *                  : `"` (character)* `"`
 *                  | array
 *
 * array            : `[` `]`
 *                  | `[` assignment (, assignment)* `]`
 *                  | number
 *
 * number           : number-token
 *                  | parentheses
 *
 * parentheses      : `(` assignment `)`
 *                  : end
 *
 * end              : NULL
 *
 * @param {[type]} lexer [description]
 */
function Parser () {
  this.lexer = new Lexer()
  this.tokens = null
}

Parser.prototype.current = function () {
  return this.tokens[0]
}

Parser.prototype.next = function () {
  return this.tokens[1]
}

Parser.prototype.peek = function () {
  if (this.tokens.length) {
    var first = this.tokens[0]
    for (var i = 0; i < arguments.length; i += 1) {
      if (first.value === arguments[i]) {
        return true
      }
    }
  }
}

Parser.prototype.consume = function (e) {
  return this.tokens.shift()
}

Parser.prototype.expect = function (e) {
  if (!this.peek(e)) {
    throw Error('expected ' + e)
  }
  return this.consume()
}

Parser.prototype.isEOF = function () {
  return this.current().type === tokenType.EOF
}

Parser.prototype.parse = function (text) {
  this.tokens = this.lexer.lex(text)
  return this.program()
}

Parser.prototype.program = function () {
  var blocks = []
  while (!this.isEOF()) {
    blocks.push(this.assignment())
    if (this.peek(';')) {
      this.consume()
    }
  }
  this.end()
  return new BlockNode(blocks)
}

Parser.prototype.assignment = function () {
  var left = this.ternary()
  if (left instanceof SymbolNode && this.peek('=')) {
    this.consume()
    return new AssignmentNode(left.name, this.assignment())
  }
  return left
}

Parser.prototype.ternary = function () {
  var predicate = this.logicalOR()
  if (this.peek('?')) {
    this.consume()
    var truthy = this.ternary()
    this.expect(':')
    var falsy = this.ternary()
    return new ConditionalNode(predicate, truthy, falsy)
  }
  return predicate
}

Parser.prototype.logicalOR = function () {
  var left = this.logicalXOR()
  if (this.peek('||')) {
    var op = this.consume()
    var right = this.logicalOR()
    return new OperatorNode(op.value, [left, right])
  }
  return left
}

Parser.prototype.logicalXOR = function () {
  var left = this.logicalAND()
  if (this.current().value === 'xor') {
    var op = this.consume()
    var right = this.logicalXOR()
    return new OperatorNode(op.value, [left, right])
  }
  return left
}

Parser.prototype.logicalAND = function () {
  var left = this.bitwiseOR()
  if (this.peek('&&')) {
    var op = this.consume()
    var right = this.logicalAND()
    return new OperatorNode(op.value, [left, right])
  }
  return left
}

Parser.prototype.bitwiseOR = function () {
  var left = this.bitwiseXOR()
  if (this.peek('|')) {
    var op = this.consume()
    var right = this.bitwiseOR()
    return new OperatorNode(op.value, [left, right])
  }
  return left
}

Parser.prototype.bitwiseXOR = function () {
  var left = this.bitwiseAND()
  if (this.peek('^|')) {
    var op = this.consume()
    var right = this.bitwiseXOR()
    return new OperatorNode(op.value, [left, right])
  }
  return left
}

Parser.prototype.bitwiseAND = function () {
  var left = this.relational()
  if (this.peek('&')) {
    var op = this.consume()
    var right = this.bitwiseAND()
    return new OperatorNode(op.value, [left, right])
  }
  return left
}

Parser.prototype.relational = function () {
  var left = this.shift()
  if (this.peek('==', '===', '!=', '!==', '>=', '<=', '>', '<')) {
    var op = this.consume()
    var right = this.shift()
    return new OperatorNode(op.value, [left, right])
  }
  return left
}

Parser.prototype.shift = function () {
  var left = this.additive()
  if (this.peek('>>', '<<', '>>>')) {
    var op = this.consume()
    var right = this.shift()
    return new OperatorNode(op.value, [left, right])
  }
  return left
}

Parser.prototype.additive = function () {
  var left = this.multiplicative()
  while (this.peek('+', '-')) {
    var op = this.consume()
    left = new OperatorNode(op.value, [left, this.multiplicative()])
  }
  return left
}

Parser.prototype.multiplicative = function () {
  var op, right
  var left = this.unary()
  while (this.peek('*', '/', '%')) {
    op = this.consume()
    left = new OperatorNode(op.value, [left, this.unary()])
  }

  // implicit multiplication
  // - 2 x
  // - 2(x)
  // - (2)2
  if (this.current().type === tokenType.SYMBOL ||
      this.peek('(') ||
      (!(left.type instanceof ConstantNode) && this.current().type === tokenType.NUMBER)
      ) {
    right = this.multiplicative()
    return new OperatorNode('*', [left, right])
  }

  return left
}

Parser.prototype.unary = function () {
  if (this.peek('-', '+', '~')) {
    var op = this.consume()
    var right = this.unary()
    return new UnaryNode(op.value, right)
  }
  return this.pow()
}

Parser.prototype.pow = function () {
  var left = this.factorial()
  if (this.peek('^', '**')) {
    var op = this.consume()
    var right = this.unary()
    return new OperatorNode(op.value, [left, right])
  }
  return left
}

Parser.prototype.factorial = function () {
  var left = this.symbol()
  if (this.peek('!')) {
    var op = this.consume()
    return new OperatorNode(op.value, [left])
  }
  return left
}

Parser.prototype.symbol = function () {
  var current = this.current()
  if (current.type === tokenType.SYMBOL) {
    var symbol = this.consume()
    var node = this.functionCall(symbol)
    return node
  }
  return this.string()
}

Parser.prototype.functionCall = function (symbolToken) {
  var name = symbolToken.value
  if (this.peek('(')) {
    this.consume()
    var params = []
    while (!this.peek(')') && !this.isEOF()) {
      params.push(this.assignment())
      if (this.peek(',')) {
        this.consume()
      }
    }
    this.expect(')')
    return new FunctionNode(name, params)
  }
  return new SymbolNode(name)
}

Parser.prototype.string = function () {
  if (this.current().type === tokenType.STRING) {
    return new ConstantNode(this.consume().value, 'string')
  }
  return this.array()
}

Parser.prototype.array = function () {
  if (this.peek('[')) {
    this.consume()
    var params = []
    while (!this.peek(']') && !this.isEOF()) {
      params.push(this.assignment())
      if (this.peek(',')) {
        this.consume()
      }
    }
    this.expect(']')
    return new ArrayNode(params)
  }
  return this.number()
}

Parser.prototype.number = function () {
  var token = this.current()
  if (token.type === tokenType.NUMBER) {
    return new ConstantNode(this.consume().value, 'number')
  }
  return this.parentheses()
}

Parser.prototype.parentheses = function () {
  var token = this.current()
  if (token.value === '(') {
    this.consume()
    var left = this.assignment()
    this.expect(')')
    return left
  }
  return this.end()
}

Parser.prototype.end = function () {
  var token = this.current()
  if (token.type !== tokenType.EOF) {
    throw Error('unexpected end of expression')
  }
}

module.exports = Parser

},{"./Lexer":39,"./node/ArrayNode":41,"./node/AssignmentNode":42,"./node/BlockNode":43,"./node/ConditionalNode":44,"./node/ConstantNode":45,"./node/FunctionNode":46,"./node/OperatorNode":48,"./node/SymbolNode":49,"./node/UnaryNode":50,"./token-type":52}],41:[function(require,module,exports){
var Node = require('./Node')

function ArrayNode (nodes) {
  this.nodes = nodes
}

ArrayNode.prototype = Object.create(Node.prototype)

ArrayNode.prototype.type = 'ArrayNode'

module.exports = ArrayNode

},{"./Node":47}],42:[function(require,module,exports){
var Node = require('./Node')

function AssignmentNode (name, expr) {
  this.name = name
  this.expr = expr
}

AssignmentNode.prototype = Object.create(Node.prototype)

AssignmentNode.prototype.type = 'AssignmentNode'

module.exports = AssignmentNode

},{"./Node":47}],43:[function(require,module,exports){
var Node = require('./Node')

function BlockNode (blocks) {
  this.blocks = blocks
}

BlockNode.prototype = Object.create(Node.prototype)

BlockNode.prototype.type = 'BlockNode'

module.exports = BlockNode

},{"./Node":47}],44:[function(require,module,exports){
var Node = require('./Node')

function ConditionalNode (predicate, truthy, falsy) {
  this.condition = predicate
  this.trueExpr = truthy
  this.falseExpr = falsy
}

ConditionalNode.prototype = Object.create(Node.prototype)

ConditionalNode.prototype.type = 'ConditionalNode'

module.exports = ConditionalNode

},{"./Node":47}],45:[function(require,module,exports){
var Node = require('./Node')

var SUPPORTED_TYPES = {
  number: true,
  string: true,
  'boolean': true,
  'undefined': true,
  'null': true
}

function ConstantNode (value, type) {
  if (!SUPPORTED_TYPES[type]) {
    throw Error('unsupported type \'' + type + '\'')
  }
  this.value = value
  this.valueType = type
}

ConstantNode.prototype = Object.create(Node.prototype)

ConstantNode.prototype.type = 'ConstantNode'

module.exports = ConstantNode

},{"./Node":47}],46:[function(require,module,exports){
var Node = require('./Node')

function FunctionNode (name, args) {
  this.name = name
  this.args = args
}

FunctionNode.prototype = Object.create(Node.prototype)

FunctionNode.prototype.type = 'FunctionNode'

module.exports = FunctionNode

},{"./Node":47}],47:[function(require,module,exports){
function Node () {

}

Node.prototype.type = 'Node'

module.exports = Node

},{}],48:[function(require,module,exports){
var Node = require('./Node')

function OperatorNode (op, args) {
  this.op = op
  this.args = args || []
}

OperatorNode.prototype = Object.create(Node.prototype)

OperatorNode.prototype.type = 'OperatorNode'

module.exports = OperatorNode

},{"./Node":47}],49:[function(require,module,exports){
var Node = require('./Node')

function SymbolNode (name) {
  this.name = name
}

SymbolNode.prototype = Object.create(Node.prototype)

SymbolNode.prototype.type = 'SymbolNode'

module.exports = SymbolNode

},{"./Node":47}],50:[function(require,module,exports){
var Node = require('./Node')

function UnaryNode (op, argument) {
  this.op = op
  this.argument = argument
}

UnaryNode.prototype = Object.create(Node.prototype)

UnaryNode.prototype.type = 'UnaryNode'

module.exports = UnaryNode

},{"./Node":47}],51:[function(require,module,exports){
module.exports = {
  ArrayNode: require('./ArrayNode'),
  AssignmentNode: require('./AssignmentNode'),
  BlockNode: require('./BlockNode'),
  ConditionalNode: require('./ConditionalNode'),
  ConstantNode: require('./ConstantNode'),
  FunctionNode: require('./FunctionNode'),
  Node: require('./Node'),
  OperatorNode: require('./OperatorNode'),
  SymbolNode: require('./SymbolNode'),
  UnaryNode: require('./UnaryNode')
}

},{"./ArrayNode":41,"./AssignmentNode":42,"./BlockNode":43,"./ConditionalNode":44,"./ConstantNode":45,"./FunctionNode":46,"./Node":47,"./OperatorNode":48,"./SymbolNode":49,"./UnaryNode":50}],52:[function(require,module,exports){
module.exports = {
  EOF: 0,
  DELIMITER: 1,
  NUMBER: 2,
  STRING: 3,
  SYMBOL: 4
}

},{}],53:[function(require,module,exports){
module.exports = clamp

function clamp(value, min, max) {
  return min < max
    ? (value < min ? min : value > max ? max : value)
    : (value < max ? max : value > min ? min : value)
}

},{}],54:[function(require,module,exports){
'use strict';

var hasOwn = Object.prototype.hasOwnProperty;
var toStr = Object.prototype.toString;

var isArray = function isArray(arr) {
	if (typeof Array.isArray === 'function') {
		return Array.isArray(arr);
	}

	return toStr.call(arr) === '[object Array]';
};

var isPlainObject = function isPlainObject(obj) {
	if (!obj || toStr.call(obj) !== '[object Object]') {
		return false;
	}

	var hasOwnConstructor = hasOwn.call(obj, 'constructor');
	var hasIsPrototypeOf = obj.constructor && obj.constructor.prototype && hasOwn.call(obj.constructor.prototype, 'isPrototypeOf');
	// Not own constructor property must be Object
	if (obj.constructor && !hasOwnConstructor && !hasIsPrototypeOf) {
		return false;
	}

	// Own properties are enumerated firstly, so to speed up,
	// if last one is own, then all properties are own.
	var key;
	for (key in obj) {/**/}

	return typeof key === 'undefined' || hasOwn.call(obj, key);
};

module.exports = function extend() {
	var options, name, src, copy, copyIsArray, clone,
		target = arguments[0],
		i = 1,
		length = arguments.length,
		deep = false;

	// Handle a deep copy situation
	if (typeof target === 'boolean') {
		deep = target;
		target = arguments[1] || {};
		// skip the boolean and the target
		i = 2;
	} else if ((typeof target !== 'object' && typeof target !== 'function') || target == null) {
		target = {};
	}

	for (; i < length; ++i) {
		options = arguments[i];
		// Only deal with non-null/undefined values
		if (options != null) {
			// Extend the base object
			for (name in options) {
				src = target[name];
				copy = options[name];

				// Prevent never-ending loop
				if (target !== copy) {
					// Recurse if we're merging plain objects or arrays
					if (deep && copy && (isPlainObject(copy) || (copyIsArray = isArray(copy)))) {
						if (copyIsArray) {
							copyIsArray = false;
							clone = src && isArray(src) ? src : [];
						} else {
							clone = src && isPlainObject(src) ? src : {};
						}

						// Never move original objects, clone them
						target[name] = extend(deep, clone, copy);

					// Don't bring in undefined values
					} else if (typeof copy !== 'undefined') {
						target[name] = copy;
					}
				}
			}
		}
	}

	// Return the modified object
	return target;
};


},{}],55:[function(require,module,exports){
'use strict';

module.exports = Integrator;

// This algorithm adapted from pseudocode in:
// http://www.math.utk.edu/~ccollins/refs/Handouts/rich.pdf
function adsimp (f, a, b, fa, fm, fb, V0, tol, maxdepth, depth, state) {
  if (state.nanEncountered) {
    return NaN;
  }

  var h, f1, f2, sl, sr, s2, m, V1, V2, err;

  h = b - a;
  f1 = f(a + h * 0.25);
  f2 = f(b - h * 0.25);

  // Simple check for NaN:
  if (isNaN(f1)) {
    state.nanEncountered = true;
    return;
  }

  // Simple check for NaN:
  if (isNaN(f2)) {
    state.nanEncountered = true;
    return;
  }

  sl = h * (fa + 4 * f1 + fm) / 12;
  sr = h * (fm + 4 * f2 + fb) / 12;
  s2 = sl + sr;
  err = (s2 - V0) / 15;

  if (depth > maxdepth) {
    state.maxDepthCount++;
    return s2 + err;
  } else if (Math.abs(err) < tol) {
    return s2 + err;
  } else {
    m = a + h * 0.5;

    V1 = adsimp(f, a, m, fa, f1, fm, sl, tol * 0.5, maxdepth, depth + 1, state);

    if (isNaN(V1)) {
      state.nanEncountered = true;
      return NaN;
    }

    V2 = adsimp(f, m, b, fm, f2, fb, sr, tol * 0.5, maxdepth, depth + 1, state);

    if (isNaN(V2)) {
      state.nanEncountered = true;
      return NaN;
    }

    return V1 + V2;
  }
}

function Integrator (f, a, b, tol, maxdepth) {
  var state = {
    maxDepthCount: 0,
    nanEncountered: false
  };

  if (tol === undefined) {
    tol = 1e-8;
  }
  if (maxdepth === undefined) {
    maxdepth = 20;
  }

  var fa = f(a);
  var fm = f(0.5 * (a + b));
  var fb = f(b);

  var V0 = (fa + 4 * fm + fb) * (b - a) / 6;

  var result = adsimp(f, a, b, fa, fm, fb, V0, tol, maxdepth, 1, state);

  if (state.maxDepthCount > 0 && console && console.warn) {
    console.warn('integrate-adaptive-simpson: Warning: maximum recursion depth (' + maxdepth + ') reached ' + state.maxDepthCount + ' times');
  }

  if (state.nanEncountered && console && console.warn) {
    console.warn('integrate-adaptive-simpson: Warning: NaN encountered. Halting early.');
  }

  return result;
}

},{}],56:[function(require,module,exports){
/*
 * interval-arithmetic-eval
 *
 * Copyright (c) 2015 Mauricio Poppe
 * Licensed under the MIT license.
 */
'use strict'
module.exports = require('./lib/eval')

},{"./lib/eval":58}],57:[function(require,module,exports){
'use strict'
module.exports = function (ns) {
  // mod
  ns.mod = ns.fmod

  // relational
  ns.lessThan = ns.lt
  ns.lessEqualThan = ns.leq
  ns.greaterThan = ns.gt
  ns.greaterEqualThan = ns.geq

  ns.strictlyEqual = ns.equal
  ns.strictlyNotEqual = ns.notEqual

  ns.logicalAND = function (a, b) {
    return a && b
  }
  ns.logicalXOR = function (a, b) {
    return a ^ b
  }
  ns.logicalOR = function (a, b) {
    return a || b
  }
}

},{}],58:[function(require,module,exports){
/**
 * Created by mauricio on 5/12/15.
 */
'use strict'

var CodeGenerator = require('math-codegen')
var Interval = require('interval-arithmetic')
require('./adapter')(Interval)

function processScope (scope) {
  Object.keys(scope).forEach(function (k) {
    var value = scope[k]
    if (typeof value === 'number' || Array.isArray(value)) {
      scope[k] = Interval.factory(value)
    } else if (typeof value === 'object' && 'lo' in value && 'hi' in value) {
      scope[k] = Interval.factory(value.lo, value.hi)
    }
  })
}

module.exports = function (expression) {
  return new CodeGenerator()
    .setDefs({
      $$processScope: processScope
    })
    .parse(expression)
    .compile(Interval)
}

module.exports.policies = require('./policies')(Interval)
module.exports.Interval = Interval

},{"./adapter":57,"./policies":59,"interval-arithmetic":60,"math-codegen":77}],59:[function(require,module,exports){
/**
 * Created by mauricio on 5/12/15.
 */
'use strict'
module.exports = function (Interval) {
  return {
    disableRounding: function () {
      Interval.rmath.disable()
    },

    enableRounding: function () {
      Interval.rmath.enable()
    }
  }
}

},{}],60:[function(require,module,exports){
/*
 * interval-arithmetic
 *
 * Copyright (c) 2015 Mauricio Poppe
 * Licensed under the MIT license.
 */

'use strict'
var extend = require('xtend/mutable')

require('./lib/polyfill')
module.exports = require('./lib/interval')

/**
 * Use {@link Interval.round} instead
 * @memberof Interval
 * @name Interval.rmath
 * @deprecated as of 0.6.4
 */
module.exports.rmath = require('./lib/round-math')

/**
 * Link to {@link module:interval-arithmetic/round-math}
 *
 * @memberof Interval
 * @name Interval.round
 */
module.exports.round = require('./lib/round-math')

extend(
  module.exports,
  require('./lib/constants'),
  require('./lib/operations/relational'),
  require('./lib/operations/arithmetic'),
  require('./lib/operations/algebra'),
  require('./lib/operations/trigonometric'),
  require('./lib/operations/misc'),
  require('./lib/operations/utils')
)

},{"./lib/constants":61,"./lib/interval":62,"./lib/operations/algebra":63,"./lib/operations/arithmetic":64,"./lib/operations/misc":66,"./lib/operations/relational":67,"./lib/operations/trigonometric":68,"./lib/operations/utils":69,"./lib/polyfill":70,"./lib/round-math":71,"xtend/mutable":76}],61:[function(require,module,exports){
// Created by mauricio on 5/11/15.
'use strict'
var Interval = require('./interval')
var mutate = require('xtend/mutable')

var piLow = (3373259426.0 + 273688.0 / (1 << 21)) / (1 << 30)
var piHigh = (3373259426.0 + 273689.0 / (1 << 21)) / (1 << 30)

/**
 * @mixin constants
 */
var constants = {}

mutate(constants, {
  /**
   * Previous IEEE floating point value of PI (equal to Math.PI)
   * 3.141592653589793
   * @memberof constants
   * @type {number}
   */
  PI_LOW: piLow,
  /**
   * Next IEEE floating point value of PI, 3.1415926535897936
   * @memberof constants
   * @type {number}
   */
  PI_HIGH: piHigh,
  PI_HALF_LOW: piLow / 2,
  PI_HALF_HIGH: piHigh / 2,
  PI_TWICE_LOW: piLow * 2,
  PI_TWICE_HIGH: piHigh * 2
})

function getter (property, fn) {
  Object.defineProperty(constants, property, {
    get: function () {
      return fn()
    },
    enumerable: true
  })
}

/**
 * An interval that represents PI, NOTE: calls to Interval.PI always return
 * a new interval representing PI
 * @memberof constants
 * @static
 * @example
 * Interval(Interval.PI_LOW, Interval.PI_HIGH)
 * @name PI
 * @type {Interval}
 */
getter('PI', function () {
  return Interval(piLow, piHigh)
})

/**
 * An interval that represents PI / 2, NOTE: calls to Interval.PI_HALF always
 * return a new interval representing PI / 2
 * @memberof constants
 * @static
 * @example
 * Interval(Interval.PI_LOW / 2, Interval.PI_HIGH / 2)
 * @name PI_HALF
 * @type {Interval}
 */
getter('PI_HALF', function () {
  return Interval(constants.PI_HALF_LOW, constants.PI_HALF_HIGH)
})

/**
 * An interval that represents PI * 2, NOTE: calls to Interval.PI_TWICE always
 * return a new interval representing PI * 2
 * @memberof constants
 * @static
 * @example
 * Interval(Interval.PI_LOW * 2, Interval.PI_HIGH * 2)
 * @name PI_TWICE
 * @type {Interval}
 */
getter('PI_TWICE', function () {
  return Interval(constants.PI_TWICE_LOW, constants.PI_TWICE_HIGH)
})

/**
 * An interval that represents 0, NOTE: calls to Interval.ZERO always
 * return a new interval representing 0
 * @memberof constants
 * @static
 * @example
 * // Interval.ZERO is equivalent to
 * Interval(0)
 * @name ZERO
 * @type {Interval}
 */
getter('ZERO', function () {
  return Interval(0)
})

/**
 * An interval that represents 1, NOTE: calls to Interval.ONE always
 * return a new interval representing 1
 * @memberof constants
 * @static
 * @example
 * // Interval.ONE is equivalent to
 * Interval(1)
 * @name ONE
 * @type {Interval}
 */
getter('ONE', function () {
  return Interval(1)
})

/**
 * An interval that represents all the real values
 * NOTE: calls to Interval.WHOLE always return a new interval representing all
 * the real values
 * @memberof constants
 * @static
 * @example
 * // Interval.WHOLE is equivalent to
 * Interval().setWhole()
 * @name WHOLE
 * @type {Interval}
 */
getter('WHOLE', function () {
  return Interval().setWhole()
})

/**
 * An interval that represents no values
 * NOTE: calls to Interval.EMPTY always return a new interval representing no
 * values
 * @memberof constants
 * @static
 * @example
 * // Interval.EMPTY is equivalent to
 * Interval().setEmpty()
 * @name EMPTY
 * @type {Interval}
 */
getter('EMPTY', function () {
  return Interval().setEmpty()
})

module.exports = constants

},{"./interval":62,"xtend/mutable":76}],62:[function(require,module,exports){
// Created by mauricio on 4/27/15.

'use strict'
var utils = require('./operations/utils')
var round = require('./round-math')

module.exports = Interval

/**
 * Constructor for closed intervals representing all the values inside (and
 * including) `lo` and `hi` e.g. `[lo, hi]`
 *
 * NOTE: If `lo > hi` then the constructor will return an empty interval
 *
 * @class
 * @mixes arithmetic
 * @mixes algebra
 * @mixes misc
 * @mixes relational
 * @mixes trigonometric
 * @mixes utils
 * @mixes constants
 *
 * @see #bounded
 * @see #boundedSingleton
 *
 * @example
 * new Interval(1, 2)  // {lo: 1, hi: 2}
 * @example
 * // function invocation without new is also supported
 * Interval(1, 2)   // {lo: 1, hi: 2}
 * @example
 * // with numbers
 * Interval(1, 2)   // {lo: 1, hi: 2}
 * Interval(1)      // {lo: 1, hi: 1}
 * @example
 * // with an array
 * Interval([1, 2]) // {lo: 1, hi: 2}
 * @example
 * // singleton intervals
 * var x = Interval(1)
 * var y = Interval(2)
 * Interval(x, y)   // {lo: 1, hi: 2}
 * @example
 * // when `lo > hi` it returns an empty interval
 * Interval(2, 1)   // {lo: Infinity, hi: -Infinity}
 * @example
 * // bounded interval
 * Interval().bounded(1, 2)  // { lo: 0.9999999999999999, hi: 2.0000000000000004 }
 * @example
 * // singleton bounded interval
 * Interval().boundedSingleton(2)  // {lo: 1.9999999999999998, hi: 2.0000000000000004}
 * @example
 * // half open and open intervals
 * // [2, 3]
 * Interval(2, 3)                     // {lo: 2, hi: 3}
 * // (2, 3]
 * Interval().halfOpenLeft(2, 3)      // {lo: 2.0000000000000004, hi: 3}
 * // [2, 3)
 * Interval().halfOpenRight(2, 3)     // {lo: 2, hi: 2.9999999999999996}
 * // (2, 3)
 * Interval().open(2, 3)              // {lo: 2.0000000000000004, hi: 2.9999999999999996}
 *
 * @param {number|array|Interval} lo The left endpoint of the interval if it's a
 * number or a singleton interval, if it's an array then an interval will be
 * built out of the elements of the array
 * @param {number|Interval} [hi] The right endpoint of the interval if it's a
 * number or a singleton interval, if omitted then a singleton interval will be
 * built out of `lo`
 */
function Interval (lo, hi) {
  if (!(this instanceof Interval)) {
    return new Interval(lo, hi)
  }

  if (typeof lo !== 'undefined' && typeof hi !== 'undefined') {
    // possible cases:
    // - Interval(1, 2)
    // - Interval(Interval(1, 1), Interval(2, 2))     // singletons are required
    if (utils.isInterval(lo)) {
      if (!utils.isSingleton(lo)) {
        throw new TypeError('Interval: interval `lo` must be a singleton')
      }
      lo = lo.lo
    }
    if (utils.isInterval(hi)) {
      if (!utils.isSingleton(hi)) {
        throw TypeError('Interval: interval `hi` must be a singleton')
      }
      hi = hi.hi
    }
  } else if (typeof lo !== 'undefined') {
    // possible cases:
    // - Interval(1)
    // - Interval([1, 2])
    // - Interval([Interval(1, 1), Interval(2, 2)])
    if (Array.isArray(lo)) {
      return Interval(lo[0], lo[1])
    }
    return Interval(lo, lo)
  } else {
    // possible cases:
    // - Interval()
    lo = hi = 0
  }

  /**
   * The left endpoint of the interval
   * @type {number}
   */
  this.lo = undefined

  /**
   * The right endpoint of the interval
   * @type {number}
   */
  this.hi = undefined

  this.assign(lo, hi)
}

Interval.factory = Interval

/**
 * Sets `this.lo` and `this.hi` to a single value `v`
 *
 * @param {number} v
 * @return {Interval} The calling interval i.e. `this`
 */
Interval.prototype.singleton = function (v) {
  return this.set(v, v)
}

/**
 * Sets new endpoints to this interval, the left endpoint is equal to the
 * previous IEEE floating point value of `lo` and the right endpoint
 * is equal to the next IEEE floating point
 * value of `hi`, it's assumed that `lo <= hi`
 * @example
 * var x = Interval().bounded(1, 2)
 * x.lo < 1 // true, x.lo === 0.9999999999999999
 * x.hi > 2 // true, x.hi === 2.0000000000000004
 * @example
 * // the correct representation of 1/3
 * var x = Interval().bounded(1/3, 1/3)
 * x.lo < 1/3 // true
 * x.hi > 1/3 // true
 * // however the floating point representation of 1/3 is less than the real 1/3
 * // therefore the left endpoint could be 1/3 instead of the previous value of
 * var next = Interval.round.safeNext
 * var x = Interval().set(1/3, next(1/3))
 * // x now represents 1/3 correctly
 * @param {number} lo
 * @param {number} hi
 * @return {Interval} The calling interval i.e. `this`
 */
Interval.prototype.bounded = function (lo, hi) {
  return this.set(round.prev(lo), round.next(hi))
}

/**
 * Equivalent to `Interval().bounded(v, v)`
 * @param {number} v
 * @return {Interval} The calling interval i.e. `this`
 */
Interval.prototype.boundedSingleton = function (v) {
  return this.bounded(v, v)
}

/**
 * Sets new endpoints for this interval, this method bypasses any
 * checks on the type of arguments
 *
 * @param {Number} lo The left endpoint of the interval
 * @param {Number} hi The right endpoint of the interval
 * @return {Interval} The calling interval
 */
Interval.prototype.set = function (lo, hi) {
  this.lo = lo
  this.hi = hi
  return this
}

/**
 * Sets new endpoints for this interval checking that both arguments exist
 * and that are valid numbers, additionally if `lo > hi` the interval is set to
 * an empty interval
 *
 * @param {Number} lo The left endpoint of the interval
 * @param {Number} hi The right endpoint of the interval
 * @return {Interval} The calling interval
 */
Interval.prototype.assign = function (lo, hi) {
  if (typeof lo !== 'number' || typeof hi !== 'number') {
    throw TypeError('Interval#assign: arguments must be numbers')
  }
  if (isNaN(lo) || isNaN(hi) || lo > hi) {
    return this.setEmpty()
  }
  return this.set(lo, hi)
}

/**
 * Sets the endpoints of this interval to `[∞, -∞]` effectively representing
 * no values
 * @return {Interval} The calling interval
 */
Interval.prototype.setEmpty = function () {
  return this.set(Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY)
}

/**
 * Sets the endpoints of this interval to `[-∞, ∞]` effectively representing all
 * the possible real values
 * @return {Interval} The calling interval
 */
Interval.prototype.setWhole = function () {
  return this.set(Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY)
}

/**
 * Sets the endpoints of this interval to the open interval `(lo, hi)`
 *
 * NOTE: `Interval.round.disable` has no effect on this method
 *
 * @example
 * // (2, 3)
 * Interval().open(2, 3)  // {lo: 2.0000000000000004, hi: 2.9999999999999996}
 * @param {number} lo
 * @param {number} hi
 * @return {Interval} The calling interval
 */
Interval.prototype.open = function (lo, hi) {
  return this.assign(round.safeNext(lo), round.safePrev(hi))
}

/**
 * Sets the endpoints of this interval to the half open interval `(lo, hi]`
 *
 * NOTE: `Interval.round.disable` has no effect on this method
 *
 * @example
 * // (2, 3]
 * Interval().halfOpenLeft(2, 3)  // {lo: 2.0000000000000004, hi: 3}
 * @param {number} lo
 * @param {number} hi
 * @return {Interval} The calling interval
 */
Interval.prototype.halfOpenLeft = function (lo, hi) {
  return this.assign(round.safeNext(lo), hi)
}

/**
 * Sets the endpoints of this interval to the half open interval `[lo, hi)`
 *
 * NOTE: `Interval.round.disable` has no effect on this method
 *
 * @example
 * // [2, 3)
 * Interval.halfOpenRight(2, 3)     // {lo: 2, hi: 2.9999999999999996}
 * @param {number} lo
 * @param {number} hi
 * @return {Interval} The calling interval
 */
Interval.prototype.halfOpenRight = function (lo, hi) {
  return this.assign(lo, round.safePrev(hi))
}

/**
 * Array representation of this interval
 * @return {array}
 */
Interval.prototype.toArray = function () {
  return [this.lo, this.hi]
}

/**
 * Creates an interval equal to the calling one
 * @see Interval.clone
 * @name Interval.prototype
 * @example
 * var x = Interval(2, 3)
 * x.clone()    // Interval(2, 3)
 * @return {Interval}
 */
Interval.prototype.clone = function () {
  return Interval().set(this.lo, this.hi)
}

},{"./operations/utils":69,"./round-math":71}],63:[function(require,module,exports){
/**
 * Created by mauricio on 5/11/15.
 */
'use strict'

var isSafeInteger = require('is-safe-integer')

var Interval = require('../interval')
var rmath = require('../round-math')
var utils = require('./utils')
var arithmetic = require('./arithmetic')
var constants = require('../constants')

/**
 * @mixin algebra
 */
var algebra = {}

/**
 * Computes x mod y (x - k * y)
 * @example
 * Interval.fmod(
 *   Interval(5.3, 5.3),
 *   Interval(2, 2)
 * ) // Interval(1.3, 1.3)
 * @example
 * Interval.fmod(
 *   Interval(5, 7),
 *   Interval(2, 3)
 * ) // Interval(2, 5)
 * @param {Interval} x
 * @param {Interval} y
 * @return {Interval}
 */
algebra.fmod = function (x, y) {
  if (utils.isEmpty(x) || utils.isEmpty(y)) {
    return constants.EMPTY
  }
  var yb = x.lo < 0 ? y.lo : y.hi
  var n = rmath.intLo(rmath.divLo(x.lo, yb))
  // x mod y = x - n * y
  return arithmetic.sub(x, arithmetic.mul(y, Interval(n)))
}

/**
 * Computes 1 / x
 * @example
 * Interval.multiplicativeInverse(
 *   Interval(2, 6)
 * )  // Interval(1/6, 1/2)
 * @example
 * Interval.multiplicativeInverse(
 *   Interval(-6, -2)
 * )  // Interval(-1/2, -1/6)
 * @param {Interval} x
 * @returns {Interval}
 */
algebra.multiplicativeInverse = function (x) {
  if (utils.isEmpty(x)) { return constants.EMPTY }
  if (utils.zeroIn(x)) {
    if (x.lo !== 0) {
      if (x.hi !== 0) {
        return constants.WHOLE
      } else {
        return Interval(
          Number.NEGATIVE_INFINITY,
          rmath.divHi(1, x.lo)
        )
      }
    } else {
      if (x.hi !== 0) {
        return Interval(
          rmath.divLo(1, x.hi),
          Number.POSITIVE_INFINITY
        )
      } else {
        return constants.EMPTY
      }
    }
  } else {
    return Interval(
      rmath.divLo(1, x.hi),
      rmath.divHi(1, x.lo)
    )
  }
}

/**
 * Computes x^power given that `power` is an integer
 *
 * If `power` is an Interval it must be a singletonInterval i.e. x^x is not
 * supported yet
 *
 * If `power` is a rational number use {@link arithmetic.nthRoot} instead
 *
 * @example
 * // 2^{-2}
 * Interval.pow(
 *   Interval(2, 2),
 *   -2
 * )  // Interval(1/4, 1/4)
 * @example
 * // [2,3]^2
 * Interval.pow(
 *   Interval(2, 3),
 *   2
 * )  // Interval(4, 9)
 * @example
 * // [2,3]^0
 * Interval.pow(
 *   Interval(2, 3),
 *   0
 * )  // Interval(1, 1)
 * @example
 * // with a singleton interval
 * Interval.pow(
 *   Interval(2, 3),
 *   Interval(2)
 * )  // Interval(4, 9)
 * @param {Interval} x
 * @param {number|Interval} power A number of a singleton interval
 * @returns {Interval}
 */
algebra.pow = function (x, power) {
  if (utils.isEmpty(x)) {
    return constants.EMPTY
  }
  if (typeof power === 'object') {
    if (!utils.isSingleton(power)) {
      return constants.EMPTY
    }
    power = power.lo
  }

  if (power === 0) {
    if (x.lo === 0 && x.hi === 0) {
      // 0^0
      return constants.EMPTY
    } else {
      // x^0
      return constants.ONE
    }
  } else if (power < 0) {
    // compute 1 / x^-power if power is negative
    return algebra.multiplicativeInverse(algebra.pow(x, -power))
  }

  // power > 0
  if (isSafeInteger(power)) {
    // power is integer
    if (x.hi < 0) {
      // [negative, negative]
      // assume that power is even so the operation will yield a positive interval
      // if not then just switch the sign and order of the interval bounds
      var yl = rmath.powLo(-x.hi, power)
      var yh = rmath.powHi(-x.lo, power)
      if (power & 1) {
        // odd power
        return Interval(-yh, -yl)
      } else {
        // even power
        return Interval(yl, yh)
      }
    } else if (x.lo < 0) {
      // [negative, positive]
      if (power & 1) {
        return Interval(
          -rmath.powLo(-x.lo, power),
          rmath.powHi(x.hi, power)
        )
      } else {
        // even power means that any negative number will be zero (min value = 0)
        // and the max value will be the max of x.lo^power, x.hi^power
        return Interval(
          0,
          rmath.powHi(Math.max(-x.lo, x.hi), power)
        )
      }
    } else {
      // [positive, positive]
      return Interval(
        rmath.powLo(x.lo, power),
        rmath.powHi(x.hi, power)
      )
    }
  } else {
    console.warn('power is not an integer, you should use nth-root instead, returning an empty interval')
    return constants.EMPTY
  }
}

/**
 * Computes sqrt(x), alias for `nthRoot(x, 2)`
 * @example
 * Interval.sqrt(
 *   Interval(4, 9)
 * ) // Interval(prev(2), next(3))
 * @param {Interval} x
 * @returns {Interval}
 */
algebra.sqrt = function (x) {
  return algebra.nthRoot(x, 2)
}

/**
 * Computes x^(1/n)
 *
 * @example
 * Interval.nthRoot(
 *   Interval(-27, -8),
 *   3
 * ) // Interval(-3, -2)
 * @param {Interval} x
 * @param {number|Interval} n A number or a singleton interval
 * @return {Interval}
 */
algebra.nthRoot = function (x, n) {
  if (utils.isEmpty(x) || n < 0) {
    // compute 1 / x^-power if power is negative
    return constants.EMPTY
  }

  // singleton interval check
  if (typeof n === 'object') {
    if (!utils.isSingleton(n)) {
      return constants.EMPTY
    }
    n = n.lo
  }

  var power = 1 / n
  if (x.hi < 0) {
    // [negative, negative]
    if (isSafeInteger(n) & (n & 1)) {
      // when n is odd we can always take the nth root
      var yl = rmath.powHi(-x.lo, power)
      var yh = rmath.powLo(-x.hi, power)
      return Interval(-yl, -yh)
    }
    // n is not odd therefore there's no nth root
    return Interval.EMPTY
  } else if (x.lo < 0) {
    // [negative, positive]
    var yp = rmath.powHi(x.hi, power)
    if (isSafeInteger(n) & (n & 1)) {
      // nth root of x.lo is possible (n is odd)
      var yn = rmath.powHi(-x.lo, power)
      return Interval(0, Math.max(yn, yp))
    }
    return Interval(0, yp)
  } else {
    // [positive, positive]
    return Interval(
      rmath.powLo(x.lo, power),
      rmath.powHi(x.hi, power)
    )
  }
}

module.exports = algebra

},{"../constants":61,"../interval":62,"../round-math":71,"./arithmetic":64,"./utils":69,"is-safe-integer":72}],64:[function(require,module,exports){
// Created by mauricio on 5/10/15.

'use strict'
var Interval = require('../interval')
var rmath = require('../round-math')
var utils = require('./utils')
var constants = require('../constants')
var division = require('./division')

/**
 * @mixin arithmetic
 */
var arithmetic = {}

/**
 * Adds two intervals
 * @example
 * Interval.add(
 *   Interval(0, 1),
 *   Interval(1, 2),
 * )   // Interval(prev(1), next(3))
 * @param {Interval} x
 * @param {Interval} y
 * @return {Interval}
 */
arithmetic.add = function (x, y) {
  return Interval(
    rmath.addLo(x.lo, y.lo),
    rmath.addHi(x.hi, y.hi)
  )
}

/**
 * Subtracts two intervals
 * @example
 * Interval.subtract(
 *   Interval(0, 1),
 *   Interval(1, 2),
 * )   // Interval(prev(-2), next(0))
 * @param {Interval} x
 * @param {Interval} y
 * @return {Interval}
 */
arithmetic.subtract = function (x, y) {
  return Interval(
    rmath.subLo(x.lo, y.hi),
    rmath.subHi(x.hi, y.lo)
  )
}

/**
 * Alias for {@link arithmetic.subtract}
 * @function
 */
arithmetic.sub = arithmetic.subtract

/**
 * Multiplies two intervals, an explanation of all the possible cases ca
 * be found on [Interval Arithmetic: from Principles to Implementation - T. Hickey, Q. Ju, M.H. van Emden](http://fab.cba.mit.edu/classes/S62.12/docs/Hickey_interval.pdf)
 * @example
 * Interval.multiply(
 *  Interval(1, 2),
 *  Interval(2, 3)
 * ) // Interval(prev(2), next(6))
 * @example
 * Interval.multiply(
 *  Interval(1, Infinity),
 *  Interval(4, 6)
 * ) // Interval(prev(4), Infinity)
 * @example
 * Interval.multiply(
 *  Interval(1, 2),
 *  Interval(-3, -2)
 * ) // Interval(prev(-6), next(-2))
 * @example
 * Interval.multiply(
 *  Interval(1, 2),
 *  Interval(-2, 3)
 * ) // Interval(prev(-4), next(6))
 * @example
 * Interval.multiply(
 *  Interval(-2, -1),
 *  Interval(-3, -2)
 * ) // Interval(prev(2), next(6))
 * @param {Interval} x
 * @param {Interval} y
 * @return {Interval}
 */
arithmetic.multiply = function (x, y) {
  if (utils.isEmpty(x) || utils.isEmpty(y)) {
    return constants.EMPTY
  }
  var xl = x.lo
  var xh = x.hi
  var yl = y.lo
  var yh = y.hi
  var out = Interval()
  if (xl < 0) {
    if (xh > 0) {
      if (yl < 0) {
        if (yh > 0) {
          // mixed * mixed
          out.lo = Math.min(rmath.mulLo(xl, yh), rmath.mulLo(xh, yl))
          out.hi = Math.max(rmath.mulHi(xl, yl), rmath.mulHi(xh, yh))
        } else {
          // mixed * negative
          out.lo = rmath.mulLo(xh, yl)
          out.hi = rmath.mulHi(xl, yl)
        }
      } else {
        if (yh > 0) {
          // mixed * positive
          out.lo = rmath.mulLo(xl, yh)
          out.hi = rmath.mulHi(xh, yh)
        } else {
          // mixed * zero
          out.lo = 0
          out.hi = 0
        }
      }
    } else {
      if (yl < 0) {
        if (yh > 0) {
          // negative * mixed
          out.lo = rmath.mulLo(xl, yh)
          out.hi = rmath.mulHi(xl, yl)
        } else {
          // negative * negative
          out.lo = rmath.mulLo(xh, yh)
          out.hi = rmath.mulHi(xl, yl)
        }
      } else {
        if (yh > 0) {
          // negative * positive
          out.lo = rmath.mulLo(xl, yh)
          out.hi = rmath.mulHi(xh, yl)
        } else {
          // negative * zero
          out.lo = 0
          out.hi = 0
        }
      }
    }
  } else {
    if (xh > 0) {
      if (yl < 0) {
        if (yh > 0) {
          // positive * mixed
          out.lo = rmath.mulLo(xh, yl)
          out.hi = rmath.mulHi(xh, yh)
        } else {
          // positive * negative
          out.lo = rmath.mulLo(xh, yl)
          out.hi = rmath.mulHi(xl, yh)
        }
      } else {
        if (yh > 0) {
          // positive * positive
          out.lo = rmath.mulLo(xl, yl)
          out.hi = rmath.mulHi(xh, yh)
        } else {
          // positive * zero
          out.lo = 0
          out.hi = 0
        }
      }
    } else {
      // zero * any other value
      out.lo = 0
      out.hi = 0
    }
  }
  return out
}

/**
 * Alias for {@link arithmetic.multiply}
 * @function
 */
arithmetic.mul = arithmetic.multiply

/**
 * Computes x/y, an explanation of all the possible cases ca
 * be found on [Interval Arithmetic: from Principles to Implementation - T. Hickey, Q. Ju, M.H. van Emden](http://fab.cba.mit.edu/classes/S62.12/docs/Hickey_interval.pdf)
 *
 * NOTE: an extreme case of division might results in multiple
 * intervals, unfortunately this library doesn't support multi-interval
 * arithmetic yet so a single interval will be returned instead with
 * the {@link misc.hull} of the resulting intervals (this is the way
 * Boost implements it too)
 *
 * @example
 * Interval.divide(
 *   Interval(1, 2),
 *   Interval(3, 4)
 * ) // Interval(prev(1/4), next(2/3))
 * @example
 * Interval.divide(
 *   Interval(-2, 1),
 *   Interval(-4, -3)
 * ) // Interval(prev(-1/3), next(2/3))
 * @example
 * Interval.divide(
 *   Interval(1, 2),
 *   Interval(-1, 1)
 * ) // Interval(-Infinity, Infinity)
 * @param {Interval} x
 * @param {Interval} y
 * @return {Interval}
 */
arithmetic.divide = function (x, y) {
  if (utils.isEmpty(x) || utils.isEmpty(y)) {
    return constants.EMPTY
  }
  if (utils.zeroIn(y)) {
    if (y.lo !== 0) {
      if (y.hi !== 0) {
        return division.zero(x)
      } else {
        return division.negative(x, y.lo)
      }
    } else {
      if (y.hi !== 0) {
        return division.positive(x, y.hi)
      } else {
        return constants.EMPTY
      }
    }
  } else {
    return division.nonZero(x, y)
  }
}

/**
 * Alias for {@link arithmetic.divide}
 * @function
 */
arithmetic.div = arithmetic.divide

/**
 * Computes +x (identity function)
 * @see misc.clone
 * @example
 * Interval.positive(
 *  Interval(1, 2)
 * )  // Interval(1, 2)
 * @param {Interval} x
 * @return {Interval}
 */
arithmetic.positive = function (x) {
  return Interval(x.lo, x.hi)
}

/**
 * Computes -x
 * @example
 * Interval.negative(
 *   Interval(1, 2)
 * )  // Interval(-2, -1)
 * @example
 * Interval.negative(
 *   Interval(-Infinity, Infinity)
 * )  // Interval(-Infinity, Infinity)
 * @example
 * Interval.negative(
 *   Interval.WHOLE
 * )  // Interval.WHOLE
 * @param {Interval} x
 * @return {Interval}
 */
arithmetic.negative = function (x) {
  return Interval(-x.hi, -x.lo)
}

module.exports = arithmetic

},{"../constants":61,"../interval":62,"../round-math":71,"./division":65,"./utils":69}],65:[function(require,module,exports){
/**
 * Created by mauricio on 5/10/15.
 */
'use strict'
var Interval = require('../interval')
var rmath = require('../round-math')
var utils = require('./utils')
var constants = require('../constants')

var division = {
  /**
   * Division between intervals when `y` doesn't contain zero
   * @param {Interval} x
   * @param {Interval} y
   * @returns {Interval}
   */
  nonZero: function (x, y) {
    var xl = x.lo
    var xh = x.hi
    var yl = y.lo
    var yh = y.hi
    var out = Interval()
    if (xh < 0) {
      if (yh < 0) {
        out.lo = rmath.divLo(xh, yl)
        out.hi = rmath.divHi(xl, yh)
      } else {
        out.lo = rmath.divLo(xl, yl)
        out.hi = rmath.divHi(xh, yh)
      }
    } else if (xl < 0) {
      if (yh < 0) {
        out.lo = rmath.divLo(xh, yh)
        out.hi = rmath.divHi(xl, yh)
      } else {
        out.lo = rmath.divLo(xl, yl)
        out.hi = rmath.divHi(xh, yl)
      }
    } else {
      if (yh < 0) {
        out.lo = rmath.divLo(xh, yh)
        out.hi = rmath.divHi(xl, yl)
      } else {
        out.lo = rmath.divLo(xl, yh)
        out.hi = rmath.divHi(xh, yl)
      }
    }
    return out
  },

  /**
   * Division between an interval and a positive constant
   * @param {Interval} x
   * @param {number} v
   * @returns {Interval}
   */
  positive: function (x, v) {
    if (x.lo === 0 && x.hi === 0) {
      return x
    }

    if (utils.zeroIn(x)) {
      // mixed considering zero in both ends
      return constants.WHOLE
    }

    if (x.hi < 0) {
      // negative / v
      return Interval(
        Number.NEGATIVE_INFINITY,
        rmath.divHi(x.hi, v)
      )
    } else {
      // positive / v
      return Interval(
        rmath.divLo(x.lo, v),
        Number.POSITIVE_INFINITY
      )
    }
  },

  /**
   * Division between an interval and a negative constant
   * @param {Interval} x
   * @param {number} v
   * @returns {Interval}
   */
  negative: function (x, v) {
    if (x.lo === 0 && x.hi === 0) {
      return x
    }

    if (utils.zeroIn(x)) {
      // mixed considering zero in both ends
      return constants.WHOLE
    }

    if (x.hi < 0) {
      // negative / v
      return Interval(
        rmath.divLo(x.hi, v),
        Number.POSITIVE_INFINITY
      )
    } else {
      // positive / v
      return Interval(
        Number.NEGATIVE_INFINITY,
        rmath.divHi(x.lo, v)
      )
    }
  },

  /**
   * Division between an interval and zero
   * @param {Interval} x
   * @returns {Interval}
   */
  zero: function (x) {
    if (x.lo === 0 && x.hi === 0) {
      return x
    }
    return constants.WHOLE
  }
}

module.exports = division

},{"../constants":61,"../interval":62,"../round-math":71,"./utils":69}],66:[function(require,module,exports){
/**
 * Created by mauricio on 5/11/15.
 */
'use strict'
var constants = require('../constants')
var Interval = require('../interval')
var rmath = require('../round-math')
var utils = require('./utils')
var arithmetic = require('./arithmetic')

/**
 * @mixin misc
 */
var misc = {}

/**
 * Computes e^x where e is the mathematical constant equal to the base of the
 * natural logarithm
 * @example
 * Interval.exp(
 *   Interval(-1, 1)
 * )  // Interval(0.3679, 2.7183)
 * @param {Interval} x
 * @return {Interval}
 */
misc.exp = function (x) {
  if (utils.isEmpty(x)) { return constants.EMPTY }
  return Interval(
    rmath.expLo(x.lo),
    rmath.expHi(x.hi)
  )
}

/**
 * Computes the natural logarithm of x
 * @example
 * Interval.log(
 *   Interval(1, Math.exp(3))
 * )  // Interval(0, 3)
 * @param {Interval} x
 * @return {Interval}
 */
misc.log = function (x) {
  if (utils.isEmpty(x)) { return constants.EMPTY }
  var l = x.lo <= 0 ? Number.NEGATIVE_INFINITY : rmath.logLo(x.lo)
  return Interval(l, rmath.logHi(x.hi))
}

/**
 * Alias for {@link misc.log}
 * @function
 */
misc.ln = misc.log

misc.LOG_EXP_10 = misc.log(Interval(10, 10))

/**
 * Computes the logarithm base 10 of x
 * @example
 * Interval.log10(
 *   Interva(1, 1000)
 * )  // Interval(0, 3)
 * @param {Interval} x
 * @return {Interval}
 */
misc.log10 = function (x) {
  if (utils.isEmpty(x)) { return constants.EMPTY }
  return arithmetic.div(misc.log(x), misc.LOG_EXP_10)
}

misc.LOG_EXP_2 = misc.log(Interval(2, 2))

/**
 * Computes the logarithm base 2 of x
 * @example
 * Interval.log10(
 *   Interva(1, 8)
 * )  // Interval(0, 3)
 * @param {Interval} x
 * @return {Interval}
 */
misc.log2 = function (x) {
  if (utils.isEmpty(x)) { return constants.EMPTY }
  return arithmetic.div(misc.log(x), misc.LOG_EXP_2)
}

/**
 * Computes an interval that has all the values of x and y, note that it may be
 * possible that values that don't belong to either x or y are included in the
 * interval that represents the hull
 *
 * @example
 * Interval.hull(
 *   Interval(-1, 1),
 *   Interval(5, 7)
 * )  // Interval(-1, 7)
 * @example
 * Interval.hull(
 *   Interval(-1, 1),
 *   Interval.EMPTY
 * )  // Interval(-1, 1)
 * @param {Interval} x
 * @param {Interval} y
 * @return {Interval}
 */
misc.hull = function (x, y) {
  var badX = utils.isEmpty(x)
  var badY = utils.isEmpty(y)
  if (badX && badY) {
    return constants.EMPTY
  } else if (badX) {
    return y.clone()
  } else if (badY) {
    return x.clone()
  } else {
    return Interval(
      Math.min(x.lo, y.lo),
      Math.max(x.hi, y.hi)
    )
  }
}

/**
 * Computes an interval that has all the values that belong to both x and y
 *
 * @example
 * Interval.intersection(
 *   Interval(-1, 1),
 *   Interval(0, 7)
 * )  // Interval(0, 1)
 * @param {Interval} x
 * @param {Interval} y
 * @return {Interval}
 */
misc.intersection = function (x, y) {
  if (utils.isEmpty(x) || utils.isEmpty(y)) { return constants.EMPTY }
  var lo = Math.max(x.lo, y.lo)
  var hi = Math.min(x.hi, y.hi)
  if (lo <= hi) {
    return Interval(lo, hi)
  }
  return constants.EMPTY
}

/**
 * Computes an interval that has all the values that belong to both x and y,
 * the difference with {@link misc.hull} is that x and y must overlap to
 * compute the union
 * @example
 * Interval.union(
 *   Interval(-1, 1),
 *   Interval(5, 7)
 * )  // throws error
 * @example
 * Interval.union(
 *   Interval(-1, 1),
 *   Interval(1, 7)
 * )  // Interval(-1, 7)
 * @throws {Error} When x and y don't overlap
 * @param {Interval} x
 * @param {Interval} y
 * @return {Interval}
 */
misc.union = function (x, y) {
  if (!utils.intervalsOverlap(x, y)) {
    throw Error('Interval#union: intervals do not overlap')
  }
  return Interval(
    Math.min(x.lo, y.lo),
    Math.max(x.hi, y.hi)
  )
}

/**
 * Computes the difference between `x` and `y`, i.e. an interval with all the
 * values of `x` that are not in `y`
 * @example
 * Interval.difference(
 *   Interval(3, 5),
 *   Interval(4, 6)
 * )  // Interval(3, prev(4))
 * @example
 * Interval.difference(
 *   Interval(0, 3),
 *   Interval(0, 1)
 * )  // Interval(next(1), 3)
 * @example
 * Interval.difference(
 *   Interval(0, 1),
 *   Interval.WHOLE
 * )  // Interval.EMPTY
 * @example
 * Interval.difference(
 *   Interval(-Infinity, 0),
 *   Interval.WHOLE
 * )  // Interval.EMPTY
 * @throws {Error} When the difference creates multiple intervals
 * @param {Interval} x
 * @param {Interval} y
 * @return {Interval}
 */
misc.difference = function (x, y) {
  if (utils.isEmpty(x) || utils.isWhole(y)) {
    return constants.EMPTY
  }
  if (utils.intervalsOverlap(x, y)) {
    if (x.lo < y.lo && y.hi < x.hi) {
      // difference creates multiple subsets
      throw Error('Interval.difference: difference creates multiple intervals')
    }

    // handle corner cases first
    if ((y.lo <= x.lo && y.hi === Infinity) ||
      (y.hi >= x.hi && y.lo === -Infinity)) {
      return constants.EMPTY
    }

    // NOTE: empty interval is handled automatically
    // e.g.
    //
    //    n = difference([0,1], [0,1]) // n = Interval(next(1), 1) = EMPTY
    //    isEmpty(n) === true
    //
    if (y.lo <= x.lo) {
      return Interval().halfOpenLeft(y.hi, x.hi)
    }

    // y.hi >= x.hi
    return Interval().halfOpenRight(x.lo, y.lo)
  }
  return Interval.clone(x)
}

/**
 * Computes the distance between the endpoints of the interval i.e.
 * `x.hi - x.lo`
 * @example
 * Interval.width(
 *   Interval(1, 2)
 * )  // 1
 * @example
 * Interval.width(
 *   Interval(-1, 1)
 * )  // 2
 * @example
 * Interval.width(
 *   Interval(1, 1)
 * )  // next(0) ~5e-324
 * @example
 * Interval.width(
 *   Interval.EMPTY
 * )  // 0
 * @param {Interval} x
 * @returns {number}
 */
misc.width = function (x) {
  if (utils.isEmpty(x)) { return 0 }
  return rmath.subHi(x.hi, x.lo)
}

/**
 * Alias for {@link misc.width}
 * @function
 */
misc.wid = misc.width

/**
 * Computes the absolute value of `x`
 * @example
 * Interval.abs(
 *   Interval(2, 3)
 * )  // Interval(2, 3)
 * @example
 * Interval.abs(
 *   Interval(-2, 3)
 * )  // Interval(2, 3)
 * @example
 * Interval.abs(
 *   Interval(-3, -2)
 * )  // Interval(2, 3)
 * @example
 * Interval.abs(
 *   Interval(-3, 2)
 * )  // Interval(0, 3)
 * @param {Interval} x
 * @return {Interval}
 */
misc.abs = function (x) {
  if (utils.isEmpty(x)) { return constants.EMPTY }
  if (x.lo >= 0) { return Interval.clone(x) }
  if (x.hi <= 0) { return arithmetic.negative(x) }
  return Interval(0, Math.max(-x.lo, x.hi))
}

/**
 * Computes an interval with the maximum values for each endpoint based on `x`
 * and `y`
 * @example
 * Interval.max(
 *   Interval(0, 3),
 *   Interval(1, 2)
 * )  // Interval(1, 3)
 * @param {Interval} x
 * @param {Interval} y
 * @return {Interval}
 */
misc.max = function (x, y) {
  var badX = utils.isEmpty(x)
  var badY = utils.isEmpty(y)
  if (badX && badY) {
    return constants.EMPTY
  } else if (badX) {
    return y.clone()
  } else if (badY) {
    return x.clone()
  } else {
    return Interval(
      Math.max(x.lo, y.lo),
      Math.max(x.hi, y.hi)
    )
  }
}

/**
 * Computes an interval with the minimum values for each endpoint based on `x`
 * and `y`
 * @example
 * Interval.min(
 *   Interval(0, 3),
 *   Interval(1, 2)
 * )  // Interval(0, 2)
 * @param {Interval} x
 * @param {Interval} y
 * @return {Interval}
 */
misc.min = function (x, y) {
  var badX = utils.isEmpty(x)
  var badY = utils.isEmpty(y)
  if (badX && badY) {
    return constants.EMPTY
  } else if (badX) {
    return y.clone()
  } else if (badY) {
    return x.clone()
  } else {
    return Interval(
      Math.min(x.lo, y.lo),
      Math.min(x.hi, y.hi)
    )
  }
}

/**
 * Creates an interval equal to `x`, equivalent to `Interval().set(x.lo, x.hi)`
 * @example
 * Interval.clone(
 *   Interval(1, 2)
 * )  // Interval(1, 2)
 * @example
 * Interval.clone(
 *   Interval.EMPTY
 * )  // Interval.EMPTY
 * @param {Interval} x
 * @return {Interval}
 */
misc.clone = function (x) {
  // no bound checking
  return Interval().set(x.lo, x.hi)
}

module.exports = misc

},{"../constants":61,"../interval":62,"../round-math":71,"./arithmetic":64,"./utils":69}],67:[function(require,module,exports){
// Created by mauricio on 5/14/15.

'use strict'
var utils = require('./utils')

// boost/numeric/interval_lib/compare/certain package on boost

/**
 * @mixin relational
 */
var relational = {}

/**
 * Checks if the intervals `x`, `y` are equal, they're equal when
 * `x.lo === y.lo` and `x.hi === y.hi`, a corner case handled is when `x` and
 * `y` are both empty intervals
 * @example
 * Interval.equal(
 *   Interval(2, 3),
 *   Interval(2, 3)
 * ) // true
 * @example
 * Interval.equal(
 *   Interval.EMPTY,
 *   Interval.EMPTY
 * ) // true
 * @param {Interval} x
 * @param {Interval} y
 * @returns {boolean}
 */
relational.equal = function (x, y) {
  if (utils.isEmpty(x)) {
    return utils.isEmpty(y)
  }
  return !utils.isEmpty(y) && x.lo === y.lo && x.hi === y.hi
}

// <debug>
relational.almostEqual = function (x, y) {
  var EPS = 1e-7
  function assert (a, message) {
    /* istanbul ignore next */
    if (!a) {
      throw new Error(message || 'assertion failed')
    }
  }

  function assertEps (a, b) {
    assert(Math.abs(a - b) < EPS, 'expected ' + a + ' to be close to ' + b)
  }

  x = Array.isArray(x) ? x : x.toArray()
  y = Array.isArray(y) ? y : y.toArray()
  assertEps(x[0], y[0])
  assertEps(x[1], y[1])
  assert(x[0] <= x[1], 'interval must not be empty')
}
// </debug>

/**
 * Checks if the intervals `x`, `y` are not equal i.e. when the intervals don't
 * share any value
 * @example
 * Interval.notEqual(
 *   Interval(2, 3),
 *   Interval(4, 5)
 * ) // true
 * @example
 * Interval.notEqual(
 *   Interval(2, 3),
 *   Interval(3, 5)
 * ) // false
 * @example
 * Interval.notEqual(
 *   Interval(2, 4),
 *   Interval(3, 5)
 * ) // false
 * @param {Interval} x
 * @param {Interval} y
 * @returns {boolean}
 */
relational.notEqual = function (x, y) {
  if (utils.isEmpty(x)) {
    return !utils.isEmpty(y)
  }
  return utils.isEmpty(y) || x.hi < y.lo || x.lo > y.hi
}

/**
 * Checks if the interval `x` is less than `y` i.e. if all the values of `x`
 * are lower than the left endpoint of `y`
 * @example
 * Interval.lessThan(
 *   Interval(2, 3),
 *   Interval(4, 5)
 * ) // true
 * @example
 * Interval.lessThan(
 *   Interval(4, 5),
 *   Interval(2, 3)
 * ) // false
 * @param {Interval} x
 * @param {Interval} y
 * @return {boolean}
 */
relational.lessThan = function (x, y) {
  if (utils.isEmpty(x) || utils.isEmpty(y)) {
    return false
  }
  return x.hi < y.lo
}

/**
 * Alias for {@link relational.lessThan}
 * @function
 */
relational.lt = relational.lessThan

/**
 * Checks if the interval `x` is greater than `y` i.e. if all the values of `x`
 * are greater than the right endpoint of `y`
 * @example
 * Interval.greaterThan(
 *   Interval(2, 3),
 *   Interval(4, 5)
 * ) // false
 * @example
 * Interval.greaterThan(
 *   Interval(4, 5),
 *   Interval(2, 3)
 * ) // true
 * @param {Interval} x
 * @param {Interval} y
 * @return {boolean}
 */
relational.greaterThan = function (x, y) {
  if (utils.isEmpty(x) || utils.isEmpty(y)) {
    return false
  }
  return x.lo > y.hi
}

/**
 * Alias for {@link relational.greaterThan}
 * @function
 */
relational.gt = relational.greaterThan

/**
 * Checks if the interval `x` is less or equal than `y` i.e.
 * if all the values of `x` are lower or equal to the left endpoint of `y`
 * @example
 * Interval.lessEqualThan(
 *   Interval(2, 3),
 *   Interval(3, 5)
 * ) // true
 * @param {Interval} x
 * @param {Interval} y
 * @return {boolean}
 */
relational.lessEqualThan = function (x, y) {
  if (utils.isEmpty(x) || utils.isEmpty(y)) {
    return false
  }
  return x.hi <= y.lo
}

/**
 * Alias for {@link relational.lessEqualThan}
 * @function
 */
relational.leq = relational.lessEqualThan

/**
 * Checks if the interval `x` is greater or equal than `y` i.e.
 * if all the values of `x` are greater or equal to the right endpoint of `y`
 * @param {Interval} x
 * @param {Interval} y
 * @return {boolean}
 */
relational.greaterEqualThan = function (x, y) {
  if (utils.isEmpty(x) || utils.isEmpty(y)) {
    return false
  }
  return x.lo >= y.hi
}

/**
 * Alias for {@link relational.greaterEqualThan}
 * @function
 */
relational.geq = relational.greaterEqualThan

module.exports = relational

},{"./utils":69}],68:[function(require,module,exports){
/**
 * Created by mauricio on 5/10/15.
 */
'use strict'
var constants = require('../constants')
var Interval = require('../interval')
var rmath = require('../round-math')
var utils = require('./utils')
var misc = require('./misc')
var algebra = require('./algebra')
var arithmetic = require('./arithmetic')

/**
 * @mixin trigonometric
 */
var trigonometric = {}

var cache = Interval()

/**
 * Computes the cosine of `x`
 * @example
 * Interval.cos(
 *   Interval(0, 0)
 * ) // Interval(1, 1)
 * @example
 * Interval.cos(
 *   Interval(0, Math.PI / 2)
 * ) // Interval(0, 1)
 * @example
 * Interval.cos(
 *   Interval(3 * Math.PI / 2, 3 * Math.PI)
 * ) // Interval(-1, 1)
 * @param {Interval} x
 * @return {Interval}
 */
trigonometric.cos = function (x) {
  var rlo, rhi
  if (utils.isEmpty(x)) { return constants.EMPTY }

  // save in cache since `x` might be modified
  cache.set(x.lo, x.hi)

  // cos works with positive intervals only, therefore negative values
  // are transformed to positive ones
  if (cache.lo < 0) {
    var n = Math.ceil(-cache.lo % constants.PI_TWICE_LOW)
    cache.lo += constants.PI_TWICE_LOW * n
    cache.hi += constants.PI_TWICE_LOW * n
  }

  var pi2 = constants.PI_TWICE
  var t = algebra.fmod(cache, pi2)
  if (misc.width(t) >= pi2.lo) {
    return Interval(-1, 1)
  }

  // when t.lo > pi it's the same as
  // -cos(t - pi)
  if (t.lo >= constants.PI_HIGH) {
    var cos = trigonometric.cos(
      arithmetic.sub(t, constants.PI)
    )
    return arithmetic.negative(cos)
  }

  var lo = t.lo
  var hi = t.hi
  rlo = rmath.cosLo(hi)
  rhi = rmath.cosHi(lo)
  // it's ensured that t.lo < pi and that t.lo >= 0
  if (hi <= constants.PI_LOW) {
    // when t.hi < pi
    // [cos(t.lo), cos(t.hi)]
    return Interval(rlo, rhi)
  } else if (hi <= pi2.lo) {
    // when t.hi < 2pi
    // [-1, max(cos(t.lo), cos(t.hi))]
    return Interval(-1, Math.max(rlo, rhi))
  } else {
    // t.lo < pi and t.hi > 2pi
    return Interval(-1, 1)
  }
}

/**
 * Computes the sine of `x`
 * @example
 * Interval.sin(
 *   Interval(0, 0)
 * ) // Interval(0, 0)
 * @example
 * Interval.sin(
 *   Interval(0, Math.PI / 2)
 * ) // Interval(0, 1)
 * @example
 * Interval.sin(
 *   Interval(Math.PI / 2, Math.PI / 2)
 * ) // Interval(1, 1)
 * @example
 * Interval.sin(
 *   Interval(Math.PI / 2, -Math.PI / 2)
 * ) // Interval(-1, 1)
 * @example
 * Interval.sin(
 *   Interval(Math.PI, 3 * Math.PI / 2)
 * ) // Interval(-1, 0)
 * @param {Interval} x
 * @return {Interval}
 */
trigonometric.sin = function (x) {
  if (utils.isEmpty(x)) { return constants.EMPTY }
  return trigonometric.cos(
    arithmetic.sub(x, constants.PI_HALF)
  )
}

/**
 * Computes the tangent of `x`
 * @example
 * Interval.tan(
 *   Interval(-Math.PI / 4, Math.PI / 4)
 * ) // Interval(-1, 1)
 * @example
 * Interval.tan(
 *   Interval(0, Math.PI / 2)
 * ) // Interval.WHOLE
 * @param {Interval} x
 * @return {Interval}
 */
trigonometric.tan = function (x) {
  if (utils.isEmpty(x)) { return constants.EMPTY }

  // save in cache since `x` might be modified
  cache.set(x.lo, x.hi)

  // tan works with positive intervals only, move all the negative values
  // 2 * PI * n times to the right so that they become positive
  if (cache.lo < 0) {
    var n = Math.ceil(-cache.lo % (constants.PI_TWICE_LOW))
    cache.lo += constants.PI_TWICE_LOW * n
    cache.hi += constants.PI_TWICE_LOW * n
  }

  var pi = constants.PI
  var t = algebra.fmod(cache, pi)
  if (t.lo >= constants.PI_HALF_LOW) {
    t = arithmetic.sub(t, pi)
  }
  if (t.lo <= -constants.PI_HALF_LOW || t.hi >= constants.PI_HALF_LOW) {
    return constants.WHOLE
  }
  return Interval(
    rmath.tanLo(t.lo),
    rmath.tanHi(t.hi)
  )
}

/**
 * Computes the arcsine of `x`
 * @example
 * Interval.asin(
 *   Interval(-1.57079633, 1.57079633)
 * )  // Interval(-10, 10)
 * @param {Interval} x
 * @return {Interval}
 */
trigonometric.asin = function (x) {
  if (utils.isEmpty(x) || x.hi < -1 || x.lo > 1) {
    return constants.EMPTY
  }
  var lo = x.lo <= -1 ? -constants.PI_HALF_HIGH : rmath.asinLo(x.lo)
  var hi = x.hi >= 1 ? constants.PI_HALF_HIGH : rmath.asinHi(x.hi)
  return Interval(lo, hi)
}

/**
 * Computes the arccosine of `x`
 * @example
 * Interval.acos(
 *   Interval(0, 1)
 * )  // Interval(0, Math.PI / 2)
 * @param {Interval} x
 * @return {Interval}
 */
trigonometric.acos = function (x) {
  if (utils.isEmpty(x) || x.hi < -1 || x.lo > 1) {
    return constants.EMPTY
  }
  var lo = x.hi >= 1 ? 0 : rmath.acosLo(x.hi)
  var hi = x.lo <= -1 ? constants.PI_HIGH : rmath.acosHi(x.lo)
  return Interval(lo, hi)
}

/**
 * Computes the arctangent of `x`
 * @example
 * Interval.atan(
 *   Interval(-1, 1)
 * )  // Interval(-0.785398163, 0.785398163)
 * @param {Interval} x
 * @return {Interval}
 */
trigonometric.atan = function (x) {
  if (utils.isEmpty(x)) { return constants.EMPTY }
  return Interval(rmath.atanLo(x.lo), rmath.atanHi(x.hi))
}

/**
 * Computes the hyperbolic sine of `x`
 * @example
 * Interval.sinh(
 *   Interval(-2, 2)
 * )  // Interval(-3.6286040785, 3.6286040785)
 * @param {Interval} x
 * @return {Interval}
 */
trigonometric.sinh = function (x) {
  if (utils.isEmpty(x)) { return constants.EMPTY }
  return Interval(rmath.sinhLo(x.lo), rmath.sinhHi(x.hi))
}

/**
 * Computes the hyperbolic cosine of `x`
 * @example
 * Interval.cosh(
 *   Interval(-2, 2)
 * )  // Interval(1, 3.76219569108)
 * @param {Interval} x
 * @return {Interval}
 */
trigonometric.cosh = function (x) {
  if (utils.isEmpty(x)) { return constants.EMPTY }
  if (x.hi < 0) {
    return Interval(
      rmath.coshLo(x.hi),
      rmath.coshHi(x.lo)
    )
  } else if (x.lo >= 0) {
    return Interval(
      rmath.coshLo(x.lo),
      rmath.coshHi(x.hi)
    )
  } else {
    return Interval(
      1,
      rmath.coshHi(-x.lo > x.hi ? x.lo : x.hi)
    )
  }
}

/**
 * Computes the hyperbolic tangent of `x`
 * @example
 * Interval.tanh(
 *   Interval(-Infinity, Infinity)
 * )  // Interval(-1, 1)
 * @param {Interval} x
 * @return {Interval}
 */
trigonometric.tanh = function (x) {
  if (utils.isEmpty(x)) { return constants.EMPTY }
  return Interval(rmath.tanhLo(x.lo), rmath.tanhHi(x.hi))
}

module.exports = trigonometric

},{"../constants":61,"../interval":62,"../round-math":71,"./algebra":63,"./arithmetic":64,"./misc":66,"./utils":69}],69:[function(require,module,exports){
//  Created by mauricio on 5/10/15.
'use strict'

/**
 * @mixin utils
 */
var utils = {}

/**
 * Checks if `x` is an interval, `x` is an interval if it's an object which has
 * `x.lo` and `x.hi` defined and both are numbers
 * @example
 * Interval.isInterval(
 *   Interval()
 * ) // true
 * @example
 * Interval.isInterval(
 *   undefined
 * ) // false
 * @example
 * Interval.isInterval(
 *   {lo: 1, hi: 2}
 * ) // true
 * @param  {*} x
 * @return {Boolean} true if `x` is an interval
 */
utils.isInterval = function (x) {
  return typeof x === 'object' && typeof x.lo === 'number' && typeof x.hi === 'number'
}

/**
 * Checks if `x` is empty, it's empty when `x.lo > x.hi`
 * @example
 * Interval.isEmpty(
 *   Interval.EMPTY
 * ) // true
 * @example
 * Interval.isEmpty(
 *   Interval.WHOLE
 * ) // false
 * @example
 * Interval.isEmpty(
 *   // bypass empty interval check
 *   Interval().set(1, -1)
 * ) // true
 * @param {Interval} x
 * @returns {boolean}
 */
utils.isEmpty = function (x) {
  return x.lo > x.hi
}

/**
 * Checks if an interval is a whole interval, that is an interval which covers
 * all the real numbers i.e. when `x.lo === -Infinity` and `x.hi === Infinity`
 * @example
 * Interval.isWhole(
 *   Interval.WHOLE
 * ) // true
 * @param {Interval} x
 * @returns {boolean}
 */
utils.isWhole = function (x) {
  return x.lo === -Infinity && x.hi === Infinity
}

/**
 * Checks if the intervals `x` is a singleton (an interval representing a single
 * value) i.e. when `x.lo === x.hi`
 * @example
 * Interval.isSingleton(
 *  Interval(2, 2)
 * ) // true
 * @example
 * Interval.isSingleton(
 *  Interval(2)
 * ) // true
 * @param {Interval} x
 * @returns {boolean}
 */
utils.isSingleton = function (x) {
  return x.lo === x.hi
}

/**
 * Checks if zero is included in the interval `x`
 * @example
 * Interval.zeroIn(
 *   Interval(-1, 1)
 * ) // true
 * @param {Interval} x
 * @returns {boolean}
 */
utils.zeroIn = function (x) {
  return utils.hasValue(x, 0)
}

/**
 * Checks if `value` is included in the interval `x`
 * @example
 * Interval.hasValue(
 *   Interval(-1, 1),
 *   0
 * ) // true
 * @example
 * Interval.hasValue(
 *   Interval(-1, 1),
 *   10
 * ) // false
 * @param {Interval} x
 * @param {number} value
 * @returns {boolean}
 */
utils.hasValue = function (a, value) {
  if (utils.isEmpty(a)) { return false }
  return a.lo <= value && value <= a.hi
}

/**
 * Checks if `x` is a subset of `y`
 * @example
 * Interval.hasInteravl(
 *   Interval(0, 3),
 *   Interval(1, 2)
 * ) // true
 * @example
 * Interval.hasInteravl(
 *   Interval(0, 3),
 *   Interval(1, 4)
 * ) // false
 * @param {Interval} x
 * @param {Interval} y
 * @returns {boolean}
 */
utils.hasInterval = function (x, y) {
  if (utils.isEmpty(x)) { return true }
  return !utils.isEmpty(y) && y.lo <= x.lo && x.hi <= y.hi
}

/**
 * Checks if the intervals `x`, `y` overlap i.e. if they share at least one
 * value
 * @example
 * Interval.intervalsOverlap(
 *   Interval(0, 3),
 *   Interval(1, 2)
 * ) // true
 * @example
 * Interval.intervalsOverlap(
 *   Interval(0, 2),
 *   Interval(1, 3)
 * ) // true
 * @example
 * Interval.intervalsOverlap(
 *   Interval(0, 2),
 *   Interval(2, 3)
 * ) // true
 * @example
 * Interval.intervalsOverlap(
 *   Interval(0, 1),
 *   Interval(2, 3)
 * ) // false
 * @param {Interval} x
 * @param {Interval} y
 * @returns {boolean}
 */
utils.intervalsOverlap = function (x, y) {
  if (utils.isEmpty(x) || utils.isEmpty(y)) { return false }
  return (x.lo <= y.lo && y.lo <= x.hi) ||
  (y.lo <= x.lo && x.lo <= y.hi)
}

module.exports = utils

},{}],70:[function(require,module,exports){
/**
 * Created by mauricio on 5/11/15.
 */
'use strict'

// hyperbolic functions only present on es6
Math.sinh = Math.sinh || function (x) {
  var y = Math.exp(x)
  return (y - 1 / y) / 2
}

Math.cosh = Math.cosh || function (x) {
  var y = Math.exp(x)
  return (y + 1 / y) / 2
}

Math.tanh = Math.tanh || function (x) {
  if (x === Number.POSITIVE_INFINITY) {
    return 1
  } else if (x === Number.NEGATIVE_INFINITY) {
    return -1
  } else {
    var y = Math.exp(2 * x)
    return (y - 1) / (y + 1)
  }
}

},{}],71:[function(require,module,exports){
// Created by mauricio on 4/27/15.

'use strict'
var nextafter = require('nextafter')

/**
 * @module interval-arithmetic/round-math
 */

function identity (v) { return v }
function prev (v) {
  if (v === Infinity) {
    return v
  }
  return nextafter(v, -Infinity)
}
function next (v) {
  if (v === -Infinity) {
    return v
  }
  return nextafter(v, Infinity)
}

/**
 * @alias module:interval-arithmetic/round-math
 */
var round = {
  /**
   * Computes the previous IEEE floating point representation of `v`
   * @example
   * Interval.round.safePrev(1)          // 0.9999999999999999
   * Interval.round.safePrev(3)          // 2.9999999999999996
   * Interval.round.safePrev(Infinity)   // Infinity
   * @param {number} v
   * @return {number}
   * @function
   */
  safePrev: prev,
  /**
   * Computes the next IEEE floating point representation of `v`
   * @example
   * Interval.round.safeNext(1)          // 1.0000000000000002
   * Interval.round.safeNext(3)          // 3.0000000000000004
   * Interval.round.safeNext(-Infinity)  // -Infinity
   * @param {number} v
   * @return {number}
   * @function
   */
  safeNext: next,
  prev: prev,
  next: next
}

round.addLo = function (x, y) { return this.prev(x + y) }
round.addHi = function (x, y) { return this.next(x + y) }

round.subLo = function (x, y) { return this.prev(x - y) }
round.subHi = function (x, y) { return this.next(x - y) }

round.mulLo = function (x, y) { return this.prev(x * y) }
round.mulHi = function (x, y) { return this.next(x * y) }

round.divLo = function (x, y) { return this.prev(x / y) }
round.divHi = function (x, y) { return this.next(x / y) }

function toInteger (x) {
  return x < 0 ? Math.ceil(x) : Math.floor(x)
}

round.intLo = function (x) { return toInteger(this.prev(x)) }
round.intHi = function (x) { return toInteger(this.next(x)) }

round.logLo = function (x) { return this.prev(Math.log(x)) }
round.logHi = function (x) { return this.next(Math.log(x)) }

round.expLo = function (x) { return this.prev(Math.exp(x)) }
round.expHi = function (x) { return this.next(Math.exp(x)) }

round.sinLo = function (x) { return this.prev(Math.sin(x)) }
round.sinHi = function (x) { return this.next(Math.sin(x)) }

round.cosLo = function (x) { return this.prev(Math.cos(x)) }
round.cosHi = function (x) { return this.next(Math.cos(x)) }

round.tanLo = function (x) { return this.prev(Math.tan(x)) }
round.tanHi = function (x) { return this.next(Math.tan(x)) }

round.asinLo = function (x) { return this.prev(Math.asin(x)) }
round.asinHi = function (x) { return this.next(Math.asin(x)) }

round.acosLo = function (x) { return this.prev(Math.acos(x)) }
round.acosHi = function (x) { return this.next(Math.acos(x)) }

round.atanLo = function (x) { return this.prev(Math.atan(x)) }
round.atanHi = function (x) { return this.next(Math.atan(x)) }

// polyfill required for hyperbolic functions
round.sinhLo = function (x) { return this.prev(Math.sinh(x)) }
round.sinhHi = function (x) { return this.next(Math.sinh(x)) }

round.coshLo = function (x) { return this.prev(Math.cosh(x)) }
round.coshHi = function (x) { return this.next(Math.cosh(x)) }

round.tanhLo = function (x) { return this.prev(Math.tanh(x)) }
round.tanhHi = function (x) { return this.next(Math.tanh(x)) }

/*
 * @ignore
 * ln(power) exponentiation of x
 * @param {number} x
 * @param {number} power
 * @returns {number}
 */
round.powLo = function (x, power) {
  if (power % 1 !== 0) {
    // power has decimals
    return this.prev(Math.pow(x, power))
  }

  var y = (power & 1) ? x : 1
  power >>= 1
  while (power > 0) {
    x = round.mulLo(x, x)
    if (power & 1) {
      y = round.mulLo(x, y)
    }
    power >>= 1
  }
  return y
}

/*
 * @ignore
 * ln(power) exponentiation of x
 * @param {number} x
 * @param {number} power
 * @returns {number}
 */
round.powHi = function (x, power) {
  if (power % 1 !== 0) {
    // power has decimals
    return this.next(Math.pow(x, power))
  }

  var y = (power & 1) ? x : 1
  power >>= 1
  while (power > 0) {
    x = round.mulHi(x, x)
    if (power & 1) {
      y = round.mulHi(x, y)
    }
    power >>= 1
  }
  return y
}

round.sqrtLo = function (x) { return this.prev(Math.sqrt(x)) }
round.sqrtHi = function (x) { return this.next(Math.sqrt(x)) }

/**
 * Most operations on intervals will cary the rounding error so that the
 * resulting interval correctly represents all the possible values, this feature
 * can be disabled by calling this method allowing a little boost in the
 * performance while operating on intervals
 *
 * @see module:interval-arithmetic/round-math.enable
 * @example
 * var x = Interval.add(
 *   Interval(1),
 *   Interval(1)
 * )
 * x // equal to {lo: 1.9999999999999998, hi: 2.0000000000000004}
 *
 * Interval.round.disable()
 * var y = Interval.add(
 *   Interval(1),
 *   Interval(1)
 * )
 * y // equal to {lo: 2, hi: 2}
 * @function
 */
round.disable = function () {
  this.next = this.prev = identity
}

/**
 * Enables IEEE previous/next floating point wrapping of values (enabled by
 * default)
 * @see module:interval-arithmetic/round-math.disable
 * @example
 * var x = Interval.add(
 *   Interval(1),
 *   Interval(1)
 * )
 * x // equal to {lo: 1.9999999999999998, hi: 2.0000000000000004}
 *
 * Interval.round.disable()
 * var y = Interval.add(
 *   Interval(1),
 *   Interval(1)
 * )
 * y // equal to {lo: 2, hi: 2}
 *
 * Interval.round.enable()
 * var z = Interval.add(
 *   Interval(1),
 *   Interval(1)
 * )
 * z // equal to {lo: 1.9999999999999998, hi: 2.0000000000000004}
 * @function
 */
round.enable = function () {
  this.next = next
  this.prev = prev
}

module.exports = round

},{"nextafter":74}],72:[function(require,module,exports){
'use strict';
var MAX_SAFE_INTEGER = require('max-safe-integer');

module.exports = Number.isSafeInteger || function (val) {
	return typeof val === 'number' && val === val && val !== Infinity && val !== -Infinity && parseInt(val, 10) === val && Math.abs(val) <= MAX_SAFE_INTEGER;
};

},{"max-safe-integer":73}],73:[function(require,module,exports){
'use strict';
module.exports = 9007199254740991;

},{}],74:[function(require,module,exports){
"use strict"

var doubleBits = require("double-bits")

var SMALLEST_DENORM = Math.pow(2, -1074)
var UINT_MAX = (-1)>>>0

module.exports = nextafter

function nextafter(x, y) {
  if(isNaN(x) || isNaN(y)) {
    return NaN
  }
  if(x === y) {
    return x
  }
  if(x === 0) {
    if(y < 0) {
      return -SMALLEST_DENORM
    } else {
      return SMALLEST_DENORM
    }
  }
  var hi = doubleBits.hi(x)
  var lo = doubleBits.lo(x)
  if((y > x) === (x > 0)) {
    if(lo === UINT_MAX) {
      hi += 1
      lo = 0
    } else {
      lo += 1
    }
  } else {
    if(lo === 0) {
      lo = UINT_MAX
      hi -= 1
    } else {
      lo -= 1
    }
  }
  return doubleBits.pack(lo, hi)
}
},{"double-bits":75}],75:[function(require,module,exports){
(function (Buffer){
var hasTypedArrays = false
if(typeof Float64Array !== "undefined") {
  var DOUBLE_VIEW = new Float64Array(1)
    , UINT_VIEW   = new Uint32Array(DOUBLE_VIEW.buffer)
  DOUBLE_VIEW[0] = 1.0
  hasTypedArrays = true
  if(UINT_VIEW[1] === 0x3ff00000) {
    //Use little endian
    module.exports = function doubleBitsLE(n) {
      DOUBLE_VIEW[0] = n
      return [ UINT_VIEW[0], UINT_VIEW[1] ]
    }
    function toDoubleLE(lo, hi) {
      UINT_VIEW[0] = lo
      UINT_VIEW[1] = hi
      return DOUBLE_VIEW[0]
    }
    module.exports.pack = toDoubleLE
    function lowUintLE(n) {
      DOUBLE_VIEW[0] = n
      return UINT_VIEW[0]
    }
    module.exports.lo = lowUintLE
    function highUintLE(n) {
      DOUBLE_VIEW[0] = n
      return UINT_VIEW[1]
    }
    module.exports.hi = highUintLE
  } else if(UINT_VIEW[0] === 0x3ff00000) {
    //Use big endian
    module.exports = function doubleBitsBE(n) {
      DOUBLE_VIEW[0] = n
      return [ UINT_VIEW[1], UINT_VIEW[0] ]
    }
    function toDoubleBE(lo, hi) {
      UINT_VIEW[1] = lo
      UINT_VIEW[0] = hi
      return DOUBLE_VIEW[0]
    }
    module.exports.pack = toDoubleBE
    function lowUintBE(n) {
      DOUBLE_VIEW[0] = n
      return UINT_VIEW[1]
    }
    module.exports.lo = lowUintBE
    function highUintBE(n) {
      DOUBLE_VIEW[0] = n
      return UINT_VIEW[0]
    }
    module.exports.hi = highUintBE
  } else {
    hasTypedArrays = false
  }
}
if(!hasTypedArrays) {
  var buffer = new Buffer(8)
  module.exports = function doubleBits(n) {
    buffer.writeDoubleLE(n, 0, true)
    return [ buffer.readUInt32LE(0, true), buffer.readUInt32LE(4, true) ]
  }
  function toDouble(lo, hi) {
    buffer.writeUInt32LE(lo, 0, true)
    buffer.writeUInt32LE(hi, 4, true)
    return buffer.readDoubleLE(0, true)
  }
  module.exports.pack = toDouble  
  function lowUint(n) {
    buffer.writeDoubleLE(n, 0, true)
    return buffer.readUInt32LE(0, true)
  }
  module.exports.lo = lowUint
  function highUint(n) {
    buffer.writeDoubleLE(n, 0, true)
    return buffer.readUInt32LE(4, true)
  }
  module.exports.hi = highUint
}

module.exports.sign = function(n) {
  return module.exports.hi(n) >>> 31
}

module.exports.exponent = function(n) {
  var b = module.exports.hi(n)
  return ((b<<1) >>> 21) - 1023
}

module.exports.fraction = function(n) {
  var lo = module.exports.lo(n)
  var hi = module.exports.hi(n)
  var b = hi & ((1<<20) - 1)
  if(hi & 0x7ff00000) {
    b += (1<<20)
  }
  return [lo, b]
}

module.exports.denormalized = function(n) {
  var hi = module.exports.hi(n)
  return !(hi & 0x7ff00000)
}
}).call(this,require("buffer").Buffer)
},{"buffer":114}],76:[function(require,module,exports){
module.exports = extend

var hasOwnProperty = Object.prototype.hasOwnProperty;

function extend(target) {
    for (var i = 1; i < arguments.length; i++) {
        var source = arguments[i]

        for (var key in source) {
            if (hasOwnProperty.call(source, key)) {
                target[key] = source[key]
            }
        }
    }

    return target
}

},{}],77:[function(require,module,exports){
module.exports=require(25)
},{"./lib/CodeGenerator":78}],78:[function(require,module,exports){
module.exports=require(26)
},{"./Interpreter":79,"extend":54,"mr-parser":90}],79:[function(require,module,exports){
module.exports=require(27)
},{"./node/ArrayNode":82,"./node/AssignmentNode":83,"./node/ConditionalNode":84,"./node/ConstantNode":85,"./node/FunctionNode":86,"./node/OperatorNode":87,"./node/SymbolNode":88,"./node/UnaryNode":89,"extend":54}],80:[function(require,module,exports){
module.exports=require(28)
},{}],81:[function(require,module,exports){
module.exports=require(29)
},{}],82:[function(require,module,exports){
module.exports=require(30)
},{}],83:[function(require,module,exports){
module.exports=require(31)
},{}],84:[function(require,module,exports){
module.exports=require(32)
},{}],85:[function(require,module,exports){
module.exports=require(33)
},{}],86:[function(require,module,exports){
module.exports=require(34)
},{"mr-parser":90}],87:[function(require,module,exports){
module.exports=require(35)
},{"../misc/Operators":80}],88:[function(require,module,exports){
module.exports=require(36)
},{}],89:[function(require,module,exports){
module.exports=require(37)
},{"../misc/UnaryOperators":81}],90:[function(require,module,exports){
module.exports=require(38)
},{"./lib/Lexer":91,"./lib/Parser":92,"./lib/node/":103}],91:[function(require,module,exports){
module.exports=require(39)
},{"./token-type":104}],92:[function(require,module,exports){
module.exports=require(40)
},{"./Lexer":91,"./node/ArrayNode":93,"./node/AssignmentNode":94,"./node/BlockNode":95,"./node/ConditionalNode":96,"./node/ConstantNode":97,"./node/FunctionNode":98,"./node/OperatorNode":100,"./node/SymbolNode":101,"./node/UnaryNode":102,"./token-type":104}],93:[function(require,module,exports){
module.exports=require(41)
},{"./Node":99}],94:[function(require,module,exports){
module.exports=require(42)
},{"./Node":99}],95:[function(require,module,exports){
module.exports=require(43)
},{"./Node":99}],96:[function(require,module,exports){
module.exports=require(44)
},{"./Node":99}],97:[function(require,module,exports){
module.exports=require(45)
},{"./Node":99}],98:[function(require,module,exports){
module.exports=require(46)
},{"./Node":99}],99:[function(require,module,exports){
module.exports=require(47)
},{}],100:[function(require,module,exports){
module.exports=require(48)
},{"./Node":99}],101:[function(require,module,exports){
module.exports=require(49)
},{"./Node":99}],102:[function(require,module,exports){
module.exports=require(50)
},{"./Node":99}],103:[function(require,module,exports){
module.exports=require(51)
},{"./ArrayNode":93,"./AssignmentNode":94,"./BlockNode":95,"./ConditionalNode":96,"./ConstantNode":97,"./FunctionNode":98,"./Node":99,"./OperatorNode":100,"./SymbolNode":101,"./UnaryNode":102}],104:[function(require,module,exports){
module.exports=require(52)
},{}],105:[function(require,module,exports){
"use strict";

module.exports = function isObject(x) {
	return typeof x === "object" && x !== null;
};

},{}],106:[function(require,module,exports){
(function (process){
var keys = require('vkey')
var list = Object.keys(keys)
var down = {}

reset()

module.exports = pressed

if (process.browser) {
  window.addEventListener('keydown', keydown, false)
  window.addEventListener('keyup', keyup, false)
  window.addEventListener('blur', reset, false)
}

function pressed(key) {
  return key
    ? down[key]
    : down
}

function reset() {
  list.forEach(function(code) {
    down[keys[code]] = false
  })
}

function keyup(e) {
  down[keys[e.keyCode]] = false
}

function keydown(e) {
  down[keys[e.keyCode]] = true
}

}).call(this,require('_process'))
},{"_process":118,"vkey":107}],107:[function(require,module,exports){
var ua = typeof window !== 'undefined' ? window.navigator.userAgent : ''
  , isOSX = /OS X/.test(ua)
  , isOpera = /Opera/.test(ua)
  , maybeFirefox = !/like Gecko/.test(ua) && !isOpera

var i, output = module.exports = {
  0:  isOSX ? '<menu>' : '<UNK>'
, 1:  '<mouse 1>'
, 2:  '<mouse 2>'
, 3:  '<break>'
, 4:  '<mouse 3>'
, 5:  '<mouse 4>'
, 6:  '<mouse 5>'
, 8:  '<backspace>'
, 9:  '<tab>'
, 12: '<clear>'
, 13: '<enter>'
, 16: '<shift>'
, 17: '<control>'
, 18: '<alt>'
, 19: '<pause>'
, 20: '<caps-lock>'
, 21: '<ime-hangul>'
, 23: '<ime-junja>'
, 24: '<ime-final>'
, 25: '<ime-kanji>'
, 27: '<escape>'
, 28: '<ime-convert>'
, 29: '<ime-nonconvert>'
, 30: '<ime-accept>'
, 31: '<ime-mode-change>'
, 27: '<escape>'
, 32: '<space>'
, 33: '<page-up>'
, 34: '<page-down>'
, 35: '<end>'
, 36: '<home>'
, 37: '<left>'
, 38: '<up>'
, 39: '<right>'
, 40: '<down>'
, 41: '<select>'
, 42: '<print>'
, 43: '<execute>'
, 44: '<snapshot>'
, 45: '<insert>'
, 46: '<delete>'
, 47: '<help>'
, 91: '<meta>'  // meta-left -- no one handles left and right properly, so we coerce into one.
, 92: '<meta>'  // meta-right
, 93: isOSX ? '<meta>' : '<menu>'      // chrome,opera,safari all report this for meta-right (osx mbp).
, 95: '<sleep>'
, 106: '<num-*>'
, 107: '<num-+>'
, 108: '<num-enter>'
, 109: '<num-->'
, 110: '<num-.>'
, 111: '<num-/>'
, 144: '<num-lock>'
, 145: '<scroll-lock>'
, 160: '<shift-left>'
, 161: '<shift-right>'
, 162: '<control-left>'
, 163: '<control-right>'
, 164: '<alt-left>'
, 165: '<alt-right>'
, 166: '<browser-back>'
, 167: '<browser-forward>'
, 168: '<browser-refresh>'
, 169: '<browser-stop>'
, 170: '<browser-search>'
, 171: '<browser-favorites>'
, 172: '<browser-home>'

  // ff/osx reports '<volume-mute>' for '-'
, 173: isOSX && maybeFirefox ? '-' : '<volume-mute>'
, 174: '<volume-down>'
, 175: '<volume-up>'
, 176: '<next-track>'
, 177: '<prev-track>'
, 178: '<stop>'
, 179: '<play-pause>'
, 180: '<launch-mail>'
, 181: '<launch-media-select>'
, 182: '<launch-app 1>'
, 183: '<launch-app 2>'
, 186: ';'
, 187: '='
, 188: ','
, 189: '-'
, 190: '.'
, 191: '/'
, 192: '`'
, 219: '['
, 220: '\\'
, 221: ']'
, 222: "'"
, 223: '<meta>'
, 224: '<meta>'       // firefox reports meta here.
, 226: '<alt-gr>'
, 229: '<ime-process>'
, 231: isOpera ? '`' : '<unicode>'
, 246: '<attention>'
, 247: '<crsel>'
, 248: '<exsel>'
, 249: '<erase-eof>'
, 250: '<play>'
, 251: '<zoom>'
, 252: '<no-name>'
, 253: '<pa-1>'
, 254: '<clear>'
}

for(i = 58; i < 65; ++i) {
  output[i] = String.fromCharCode(i)
}

// 0-9
for(i = 48; i < 58; ++i) {
  output[i] = (i - 48)+''
}

// A-Z
for(i = 65; i < 91; ++i) {
  output[i] = String.fromCharCode(i)
}

// num0-9
for(i = 96; i < 106; ++i) {
  output[i] = '<num-'+(i - 96)+'>'
}

// F1-F24
for(i = 112; i < 136; ++i) {
  output[i] = 'F'+(i-111)
}

},{}],108:[function(require,module,exports){
var Emitter = require('events').EventEmitter
var vkey = require('vkey')

module.exports = function(keys, el) {
  if (typeof keys === 'string') keys = [keys]
  if (!el) el = window

  var emitter = new Emitter()
  emitter.pressed = {}
  
  el.addEventListener('blur', clearPressed)
  el.addEventListener('focus', clearPressed)
  
  el.addEventListener('keydown', function(ev) {
    var key = vkey[ev.keyCode]
    emitter.pressed[key] = true
    var allPressed = true
    keys.forEach(function(k) {
      if (!emitter.pressed[k]) allPressed = false
    })
    if (allPressed) {
      emitter.emit('pressed', emitter.pressed)

      // this seems to be necessary as keyup doesn't always fire during combos :/
      clearPressed()
    }
  })

  el.addEventListener('keyup', function(ev) {
    delete emitter.pressed[vkey[ev.keyCode]]
  })
  
  function clearPressed() {
    emitter.pressed = {}
  }
  
  return emitter
}

},{"events":117,"vkey":109}],109:[function(require,module,exports){
module.exports=require(107)
},{}],110:[function(require,module,exports){
var integers = require('integers');

module.exports = function linspace(a,b,n) {
  var every = (b-a)/(n-1),
      ranged = integers(a,b,every);

  return ranged.length == n ? ranged : ranged.concat(b);
}

},{"integers":111}],111:[function(require,module,exports){
module.exports = function () {
  var from = 0,
      to = 0,
      every = 1,
      output = [];

  switch(arguments.length) {
    case 1:
      to = arguments[0];
      break;

    case 3:
      every = arguments[2];
    case 2:
      from = arguments[0];
      to = arguments[1];
      break;
  }

  for (i=from; i < to; i+=every) {
    output.push(i);
  }

  return output;
}

},{}],112:[function(require,module,exports){
'use strict';
module.exports = Math.log10 || function (x) {
	return Math.log(x) * Math.LOG10E;
};

},{}],113:[function(require,module,exports){
var linspace = require('linspace');

module.exports = function logspace(a,b,n) {
  return linspace(a,b,n).map(function(x) { return Math.pow(10,x); });
}

},{"linspace":110}],114:[function(require,module,exports){
/*!
 * The buffer module from node.js, for the browser.
 *
 * @author   Feross Aboukhadijeh <feross@feross.org> <http://feross.org>
 * @license  MIT
 */

var base64 = require('base64-js')
var ieee754 = require('ieee754')

exports.Buffer = Buffer
exports.SlowBuffer = Buffer
exports.INSPECT_MAX_BYTES = 50
Buffer.poolSize = 8192

/**
 * If `TYPED_ARRAY_SUPPORT`:
 *   === true    Use Uint8Array implementation (fastest)
 *   === false   Use Object implementation (most compatible, even IE6)
 *
 * Browsers that support typed arrays are IE 10+, Firefox 4+, Chrome 7+, Safari 5.1+,
 * Opera 11.6+, iOS 4.2+.
 *
 * Note:
 *
 * - Implementation must support adding new properties to `Uint8Array` instances.
 *   Firefox 4-29 lacked support, fixed in Firefox 30+.
 *   See: https://bugzilla.mozilla.org/show_bug.cgi?id=695438.
 *
 *  - Chrome 9-10 is missing the `TypedArray.prototype.subarray` function.
 *
 *  - IE10 has a broken `TypedArray.prototype.subarray` function which returns arrays of
 *    incorrect length in some situations.
 *
 * We detect these buggy browsers and set `TYPED_ARRAY_SUPPORT` to `false` so they will
 * get the Object implementation, which is slower but will work correctly.
 */
var TYPED_ARRAY_SUPPORT = (function () {
  try {
    var buf = new ArrayBuffer(0)
    var arr = new Uint8Array(buf)
    arr.foo = function () { return 42 }
    return 42 === arr.foo() && // typed array instances can be augmented
        typeof arr.subarray === 'function' && // chrome 9-10 lack `subarray`
        new Uint8Array(1).subarray(1, 1).byteLength === 0 // ie10 has broken `subarray`
  } catch (e) {
    return false
  }
})()

/**
 * Class: Buffer
 * =============
 *
 * The Buffer constructor returns instances of `Uint8Array` that are augmented
 * with function properties for all the node `Buffer` API functions. We use
 * `Uint8Array` so that square bracket notation works as expected -- it returns
 * a single octet.
 *
 * By augmenting the instances, we can avoid modifying the `Uint8Array`
 * prototype.
 */
function Buffer (subject, encoding, noZero) {
  if (!(this instanceof Buffer))
    return new Buffer(subject, encoding, noZero)

  var type = typeof subject

  // Find the length
  var length
  if (type === 'number')
    length = subject > 0 ? subject >>> 0 : 0
  else if (type === 'string') {
    if (encoding === 'base64')
      subject = base64clean(subject)
    length = Buffer.byteLength(subject, encoding)
  } else if (type === 'object' && subject !== null) { // assume object is array-like
    if (subject.type === 'Buffer' && isArray(subject.data))
      subject = subject.data
    length = +subject.length > 0 ? Math.floor(+subject.length) : 0
  } else
    throw new Error('First argument needs to be a number, array or string.')

  var buf
  if (TYPED_ARRAY_SUPPORT) {
    // Preferred: Return an augmented `Uint8Array` instance for best performance
    buf = Buffer._augment(new Uint8Array(length))
  } else {
    // Fallback: Return THIS instance of Buffer (created by `new`)
    buf = this
    buf.length = length
    buf._isBuffer = true
  }

  var i
  if (TYPED_ARRAY_SUPPORT && typeof subject.byteLength === 'number') {
    // Speed optimization -- use set if we're copying from a typed array
    buf._set(subject)
  } else if (isArrayish(subject)) {
    // Treat array-ish objects as a byte array
    if (Buffer.isBuffer(subject)) {
      for (i = 0; i < length; i++)
        buf[i] = subject.readUInt8(i)
    } else {
      for (i = 0; i < length; i++)
        buf[i] = ((subject[i] % 256) + 256) % 256
    }
  } else if (type === 'string') {
    buf.write(subject, 0, encoding)
  } else if (type === 'number' && !TYPED_ARRAY_SUPPORT && !noZero) {
    for (i = 0; i < length; i++) {
      buf[i] = 0
    }
  }

  return buf
}

// STATIC METHODS
// ==============

Buffer.isEncoding = function (encoding) {
  switch (String(encoding).toLowerCase()) {
    case 'hex':
    case 'utf8':
    case 'utf-8':
    case 'ascii':
    case 'binary':
    case 'base64':
    case 'raw':
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      return true
    default:
      return false
  }
}

Buffer.isBuffer = function (b) {
  return !!(b != null && b._isBuffer)
}

Buffer.byteLength = function (str, encoding) {
  var ret
  str = str.toString()
  switch (encoding || 'utf8') {
    case 'hex':
      ret = str.length / 2
      break
    case 'utf8':
    case 'utf-8':
      ret = utf8ToBytes(str).length
      break
    case 'ascii':
    case 'binary':
    case 'raw':
      ret = str.length
      break
    case 'base64':
      ret = base64ToBytes(str).length
      break
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      ret = str.length * 2
      break
    default:
      throw new Error('Unknown encoding')
  }
  return ret
}

Buffer.concat = function (list, totalLength) {
  assert(isArray(list), 'Usage: Buffer.concat(list[, length])')

  if (list.length === 0) {
    return new Buffer(0)
  } else if (list.length === 1) {
    return list[0]
  }

  var i
  if (totalLength === undefined) {
    totalLength = 0
    for (i = 0; i < list.length; i++) {
      totalLength += list[i].length
    }
  }

  var buf = new Buffer(totalLength)
  var pos = 0
  for (i = 0; i < list.length; i++) {
    var item = list[i]
    item.copy(buf, pos)
    pos += item.length
  }
  return buf
}

Buffer.compare = function (a, b) {
  assert(Buffer.isBuffer(a) && Buffer.isBuffer(b), 'Arguments must be Buffers')
  var x = a.length
  var y = b.length
  for (var i = 0, len = Math.min(x, y); i < len && a[i] === b[i]; i++) {}
  if (i !== len) {
    x = a[i]
    y = b[i]
  }
  if (x < y) {
    return -1
  }
  if (y < x) {
    return 1
  }
  return 0
}

// BUFFER INSTANCE METHODS
// =======================

function hexWrite (buf, string, offset, length) {
  offset = Number(offset) || 0
  var remaining = buf.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }

  // must be an even number of digits
  var strLen = string.length
  assert(strLen % 2 === 0, 'Invalid hex string')

  if (length > strLen / 2) {
    length = strLen / 2
  }
  for (var i = 0; i < length; i++) {
    var byte = parseInt(string.substr(i * 2, 2), 16)
    assert(!isNaN(byte), 'Invalid hex string')
    buf[offset + i] = byte
  }
  return i
}

function utf8Write (buf, string, offset, length) {
  var charsWritten = blitBuffer(utf8ToBytes(string), buf, offset, length)
  return charsWritten
}

function asciiWrite (buf, string, offset, length) {
  var charsWritten = blitBuffer(asciiToBytes(string), buf, offset, length)
  return charsWritten
}

function binaryWrite (buf, string, offset, length) {
  return asciiWrite(buf, string, offset, length)
}

function base64Write (buf, string, offset, length) {
  var charsWritten = blitBuffer(base64ToBytes(string), buf, offset, length)
  return charsWritten
}

function utf16leWrite (buf, string, offset, length) {
  var charsWritten = blitBuffer(utf16leToBytes(string), buf, offset, length)
  return charsWritten
}

Buffer.prototype.write = function (string, offset, length, encoding) {
  // Support both (string, offset, length, encoding)
  // and the legacy (string, encoding, offset, length)
  if (isFinite(offset)) {
    if (!isFinite(length)) {
      encoding = length
      length = undefined
    }
  } else {  // legacy
    var swap = encoding
    encoding = offset
    offset = length
    length = swap
  }

  offset = Number(offset) || 0
  var remaining = this.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }
  encoding = String(encoding || 'utf8').toLowerCase()

  var ret
  switch (encoding) {
    case 'hex':
      ret = hexWrite(this, string, offset, length)
      break
    case 'utf8':
    case 'utf-8':
      ret = utf8Write(this, string, offset, length)
      break
    case 'ascii':
      ret = asciiWrite(this, string, offset, length)
      break
    case 'binary':
      ret = binaryWrite(this, string, offset, length)
      break
    case 'base64':
      ret = base64Write(this, string, offset, length)
      break
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      ret = utf16leWrite(this, string, offset, length)
      break
    default:
      throw new Error('Unknown encoding')
  }
  return ret
}

Buffer.prototype.toString = function (encoding, start, end) {
  var self = this

  encoding = String(encoding || 'utf8').toLowerCase()
  start = Number(start) || 0
  end = (end === undefined) ? self.length : Number(end)

  // Fastpath empty strings
  if (end === start)
    return ''

  var ret
  switch (encoding) {
    case 'hex':
      ret = hexSlice(self, start, end)
      break
    case 'utf8':
    case 'utf-8':
      ret = utf8Slice(self, start, end)
      break
    case 'ascii':
      ret = asciiSlice(self, start, end)
      break
    case 'binary':
      ret = binarySlice(self, start, end)
      break
    case 'base64':
      ret = base64Slice(self, start, end)
      break
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      ret = utf16leSlice(self, start, end)
      break
    default:
      throw new Error('Unknown encoding')
  }
  return ret
}

Buffer.prototype.toJSON = function () {
  return {
    type: 'Buffer',
    data: Array.prototype.slice.call(this._arr || this, 0)
  }
}

Buffer.prototype.equals = function (b) {
  assert(Buffer.isBuffer(b), 'Argument must be a Buffer')
  return Buffer.compare(this, b) === 0
}

Buffer.prototype.compare = function (b) {
  assert(Buffer.isBuffer(b), 'Argument must be a Buffer')
  return Buffer.compare(this, b)
}

// copy(targetBuffer, targetStart=0, sourceStart=0, sourceEnd=buffer.length)
Buffer.prototype.copy = function (target, target_start, start, end) {
  var source = this

  if (!start) start = 0
  if (!end && end !== 0) end = this.length
  if (!target_start) target_start = 0

  // Copy 0 bytes; we're done
  if (end === start) return
  if (target.length === 0 || source.length === 0) return

  // Fatal error conditions
  assert(end >= start, 'sourceEnd < sourceStart')
  assert(target_start >= 0 && target_start < target.length,
      'targetStart out of bounds')
  assert(start >= 0 && start < source.length, 'sourceStart out of bounds')
  assert(end >= 0 && end <= source.length, 'sourceEnd out of bounds')

  // Are we oob?
  if (end > this.length)
    end = this.length
  if (target.length - target_start < end - start)
    end = target.length - target_start + start

  var len = end - start

  if (len < 100 || !TYPED_ARRAY_SUPPORT) {
    for (var i = 0; i < len; i++) {
      target[i + target_start] = this[i + start]
    }
  } else {
    target._set(this.subarray(start, start + len), target_start)
  }
}

function base64Slice (buf, start, end) {
  if (start === 0 && end === buf.length) {
    return base64.fromByteArray(buf)
  } else {
    return base64.fromByteArray(buf.slice(start, end))
  }
}

function utf8Slice (buf, start, end) {
  var res = ''
  var tmp = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++) {
    if (buf[i] <= 0x7F) {
      res += decodeUtf8Char(tmp) + String.fromCharCode(buf[i])
      tmp = ''
    } else {
      tmp += '%' + buf[i].toString(16)
    }
  }

  return res + decodeUtf8Char(tmp)
}

function asciiSlice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++) {
    ret += String.fromCharCode(buf[i])
  }
  return ret
}

function binarySlice (buf, start, end) {
  return asciiSlice(buf, start, end)
}

function hexSlice (buf, start, end) {
  var len = buf.length

  if (!start || start < 0) start = 0
  if (!end || end < 0 || end > len) end = len

  var out = ''
  for (var i = start; i < end; i++) {
    out += toHex(buf[i])
  }
  return out
}

function utf16leSlice (buf, start, end) {
  var bytes = buf.slice(start, end)
  var res = ''
  for (var i = 0; i < bytes.length; i += 2) {
    res += String.fromCharCode(bytes[i] + bytes[i + 1] * 256)
  }
  return res
}

Buffer.prototype.slice = function (start, end) {
  var len = this.length
  start = ~~start
  end = end === undefined ? len : ~~end

  if (start < 0) {
    start += len;
    if (start < 0)
      start = 0
  } else if (start > len) {
    start = len
  }

  if (end < 0) {
    end += len
    if (end < 0)
      end = 0
  } else if (end > len) {
    end = len
  }

  if (end < start)
    end = start

  if (TYPED_ARRAY_SUPPORT) {
    return Buffer._augment(this.subarray(start, end))
  } else {
    var sliceLen = end - start
    var newBuf = new Buffer(sliceLen, undefined, true)
    for (var i = 0; i < sliceLen; i++) {
      newBuf[i] = this[i + start]
    }
    return newBuf
  }
}

// `get` will be removed in Node 0.13+
Buffer.prototype.get = function (offset) {
  console.log('.get() is deprecated. Access using array indexes instead.')
  return this.readUInt8(offset)
}

// `set` will be removed in Node 0.13+
Buffer.prototype.set = function (v, offset) {
  console.log('.set() is deprecated. Access using array indexes instead.')
  return this.writeUInt8(v, offset)
}

Buffer.prototype.readUInt8 = function (offset, noAssert) {
  if (!noAssert) {
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset < this.length, 'Trying to read beyond buffer length')
  }

  if (offset >= this.length)
    return

  return this[offset]
}

function readUInt16 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val
  if (littleEndian) {
    val = buf[offset]
    if (offset + 1 < len)
      val |= buf[offset + 1] << 8
  } else {
    val = buf[offset] << 8
    if (offset + 1 < len)
      val |= buf[offset + 1]
  }
  return val
}

Buffer.prototype.readUInt16LE = function (offset, noAssert) {
  return readUInt16(this, offset, true, noAssert)
}

Buffer.prototype.readUInt16BE = function (offset, noAssert) {
  return readUInt16(this, offset, false, noAssert)
}

function readUInt32 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val
  if (littleEndian) {
    if (offset + 2 < len)
      val = buf[offset + 2] << 16
    if (offset + 1 < len)
      val |= buf[offset + 1] << 8
    val |= buf[offset]
    if (offset + 3 < len)
      val = val + (buf[offset + 3] << 24 >>> 0)
  } else {
    if (offset + 1 < len)
      val = buf[offset + 1] << 16
    if (offset + 2 < len)
      val |= buf[offset + 2] << 8
    if (offset + 3 < len)
      val |= buf[offset + 3]
    val = val + (buf[offset] << 24 >>> 0)
  }
  return val
}

Buffer.prototype.readUInt32LE = function (offset, noAssert) {
  return readUInt32(this, offset, true, noAssert)
}

Buffer.prototype.readUInt32BE = function (offset, noAssert) {
  return readUInt32(this, offset, false, noAssert)
}

Buffer.prototype.readInt8 = function (offset, noAssert) {
  if (!noAssert) {
    assert(offset !== undefined && offset !== null,
        'missing offset')
    assert(offset < this.length, 'Trying to read beyond buffer length')
  }

  if (offset >= this.length)
    return

  var neg = this[offset] & 0x80
  if (neg)
    return (0xff - this[offset] + 1) * -1
  else
    return this[offset]
}

function readInt16 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val = readUInt16(buf, offset, littleEndian, true)
  var neg = val & 0x8000
  if (neg)
    return (0xffff - val + 1) * -1
  else
    return val
}

Buffer.prototype.readInt16LE = function (offset, noAssert) {
  return readInt16(this, offset, true, noAssert)
}

Buffer.prototype.readInt16BE = function (offset, noAssert) {
  return readInt16(this, offset, false, noAssert)
}

function readInt32 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val = readUInt32(buf, offset, littleEndian, true)
  var neg = val & 0x80000000
  if (neg)
    return (0xffffffff - val + 1) * -1
  else
    return val
}

Buffer.prototype.readInt32LE = function (offset, noAssert) {
  return readInt32(this, offset, true, noAssert)
}

Buffer.prototype.readInt32BE = function (offset, noAssert) {
  return readInt32(this, offset, false, noAssert)
}

function readFloat (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset + 3 < buf.length, 'Trying to read beyond buffer length')
  }

  return ieee754.read(buf, offset, littleEndian, 23, 4)
}

Buffer.prototype.readFloatLE = function (offset, noAssert) {
  return readFloat(this, offset, true, noAssert)
}

Buffer.prototype.readFloatBE = function (offset, noAssert) {
  return readFloat(this, offset, false, noAssert)
}

function readDouble (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset + 7 < buf.length, 'Trying to read beyond buffer length')
  }

  return ieee754.read(buf, offset, littleEndian, 52, 8)
}

Buffer.prototype.readDoubleLE = function (offset, noAssert) {
  return readDouble(this, offset, true, noAssert)
}

Buffer.prototype.readDoubleBE = function (offset, noAssert) {
  return readDouble(this, offset, false, noAssert)
}

Buffer.prototype.writeUInt8 = function (value, offset, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset < this.length, 'trying to write beyond buffer length')
    verifuint(value, 0xff)
  }

  if (offset >= this.length) return

  this[offset] = value
  return offset + 1
}

function writeUInt16 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'trying to write beyond buffer length')
    verifuint(value, 0xffff)
  }

  var len = buf.length
  if (offset >= len)
    return

  for (var i = 0, j = Math.min(len - offset, 2); i < j; i++) {
    buf[offset + i] =
        (value & (0xff << (8 * (littleEndian ? i : 1 - i)))) >>>
            (littleEndian ? i : 1 - i) * 8
  }
  return offset + 2
}

Buffer.prototype.writeUInt16LE = function (value, offset, noAssert) {
  return writeUInt16(this, value, offset, true, noAssert)
}

Buffer.prototype.writeUInt16BE = function (value, offset, noAssert) {
  return writeUInt16(this, value, offset, false, noAssert)
}

function writeUInt32 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'trying to write beyond buffer length')
    verifuint(value, 0xffffffff)
  }

  var len = buf.length
  if (offset >= len)
    return

  for (var i = 0, j = Math.min(len - offset, 4); i < j; i++) {
    buf[offset + i] =
        (value >>> (littleEndian ? i : 3 - i) * 8) & 0xff
  }
  return offset + 4
}

Buffer.prototype.writeUInt32LE = function (value, offset, noAssert) {
  return writeUInt32(this, value, offset, true, noAssert)
}

Buffer.prototype.writeUInt32BE = function (value, offset, noAssert) {
  return writeUInt32(this, value, offset, false, noAssert)
}

Buffer.prototype.writeInt8 = function (value, offset, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset < this.length, 'Trying to write beyond buffer length')
    verifsint(value, 0x7f, -0x80)
  }

  if (offset >= this.length)
    return

  if (value >= 0)
    this.writeUInt8(value, offset, noAssert)
  else
    this.writeUInt8(0xff + value + 1, offset, noAssert)
  return offset + 1
}

function writeInt16 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'Trying to write beyond buffer length')
    verifsint(value, 0x7fff, -0x8000)
  }

  var len = buf.length
  if (offset >= len)
    return

  if (value >= 0)
    writeUInt16(buf, value, offset, littleEndian, noAssert)
  else
    writeUInt16(buf, 0xffff + value + 1, offset, littleEndian, noAssert)
  return offset + 2
}

Buffer.prototype.writeInt16LE = function (value, offset, noAssert) {
  return writeInt16(this, value, offset, true, noAssert)
}

Buffer.prototype.writeInt16BE = function (value, offset, noAssert) {
  return writeInt16(this, value, offset, false, noAssert)
}

function writeInt32 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to write beyond buffer length')
    verifsint(value, 0x7fffffff, -0x80000000)
  }

  var len = buf.length
  if (offset >= len)
    return

  if (value >= 0)
    writeUInt32(buf, value, offset, littleEndian, noAssert)
  else
    writeUInt32(buf, 0xffffffff + value + 1, offset, littleEndian, noAssert)
  return offset + 4
}

Buffer.prototype.writeInt32LE = function (value, offset, noAssert) {
  return writeInt32(this, value, offset, true, noAssert)
}

Buffer.prototype.writeInt32BE = function (value, offset, noAssert) {
  return writeInt32(this, value, offset, false, noAssert)
}

function writeFloat (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to write beyond buffer length')
    verifIEEE754(value, 3.4028234663852886e+38, -3.4028234663852886e+38)
  }

  var len = buf.length
  if (offset >= len)
    return

  ieee754.write(buf, value, offset, littleEndian, 23, 4)
  return offset + 4
}

Buffer.prototype.writeFloatLE = function (value, offset, noAssert) {
  return writeFloat(this, value, offset, true, noAssert)
}

Buffer.prototype.writeFloatBE = function (value, offset, noAssert) {
  return writeFloat(this, value, offset, false, noAssert)
}

function writeDouble (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 7 < buf.length,
        'Trying to write beyond buffer length')
    verifIEEE754(value, 1.7976931348623157E+308, -1.7976931348623157E+308)
  }

  var len = buf.length
  if (offset >= len)
    return

  ieee754.write(buf, value, offset, littleEndian, 52, 8)
  return offset + 8
}

Buffer.prototype.writeDoubleLE = function (value, offset, noAssert) {
  return writeDouble(this, value, offset, true, noAssert)
}

Buffer.prototype.writeDoubleBE = function (value, offset, noAssert) {
  return writeDouble(this, value, offset, false, noAssert)
}

// fill(value, start=0, end=buffer.length)
Buffer.prototype.fill = function (value, start, end) {
  if (!value) value = 0
  if (!start) start = 0
  if (!end) end = this.length

  assert(end >= start, 'end < start')

  // Fill 0 bytes; we're done
  if (end === start) return
  if (this.length === 0) return

  assert(start >= 0 && start < this.length, 'start out of bounds')
  assert(end >= 0 && end <= this.length, 'end out of bounds')

  var i
  if (typeof value === 'number') {
    for (i = start; i < end; i++) {
      this[i] = value
    }
  } else {
    var bytes = utf8ToBytes(value.toString())
    var len = bytes.length
    for (i = start; i < end; i++) {
      this[i] = bytes[i % len]
    }
  }

  return this
}

Buffer.prototype.inspect = function () {
  var out = []
  var len = this.length
  for (var i = 0; i < len; i++) {
    out[i] = toHex(this[i])
    if (i === exports.INSPECT_MAX_BYTES) {
      out[i + 1] = '...'
      break
    }
  }
  return '<Buffer ' + out.join(' ') + '>'
}

/**
 * Creates a new `ArrayBuffer` with the *copied* memory of the buffer instance.
 * Added in Node 0.12. Only available in browsers that support ArrayBuffer.
 */
Buffer.prototype.toArrayBuffer = function () {
  if (typeof Uint8Array !== 'undefined') {
    if (TYPED_ARRAY_SUPPORT) {
      return (new Buffer(this)).buffer
    } else {
      var buf = new Uint8Array(this.length)
      for (var i = 0, len = buf.length; i < len; i += 1) {
        buf[i] = this[i]
      }
      return buf.buffer
    }
  } else {
    throw new Error('Buffer.toArrayBuffer not supported in this browser')
  }
}

// HELPER FUNCTIONS
// ================

var BP = Buffer.prototype

/**
 * Augment a Uint8Array *instance* (not the Uint8Array class!) with Buffer methods
 */
Buffer._augment = function (arr) {
  arr._isBuffer = true

  // save reference to original Uint8Array get/set methods before overwriting
  arr._get = arr.get
  arr._set = arr.set

  // deprecated, will be removed in node 0.13+
  arr.get = BP.get
  arr.set = BP.set

  arr.write = BP.write
  arr.toString = BP.toString
  arr.toLocaleString = BP.toString
  arr.toJSON = BP.toJSON
  arr.equals = BP.equals
  arr.compare = BP.compare
  arr.copy = BP.copy
  arr.slice = BP.slice
  arr.readUInt8 = BP.readUInt8
  arr.readUInt16LE = BP.readUInt16LE
  arr.readUInt16BE = BP.readUInt16BE
  arr.readUInt32LE = BP.readUInt32LE
  arr.readUInt32BE = BP.readUInt32BE
  arr.readInt8 = BP.readInt8
  arr.readInt16LE = BP.readInt16LE
  arr.readInt16BE = BP.readInt16BE
  arr.readInt32LE = BP.readInt32LE
  arr.readInt32BE = BP.readInt32BE
  arr.readFloatLE = BP.readFloatLE
  arr.readFloatBE = BP.readFloatBE
  arr.readDoubleLE = BP.readDoubleLE
  arr.readDoubleBE = BP.readDoubleBE
  arr.writeUInt8 = BP.writeUInt8
  arr.writeUInt16LE = BP.writeUInt16LE
  arr.writeUInt16BE = BP.writeUInt16BE
  arr.writeUInt32LE = BP.writeUInt32LE
  arr.writeUInt32BE = BP.writeUInt32BE
  arr.writeInt8 = BP.writeInt8
  arr.writeInt16LE = BP.writeInt16LE
  arr.writeInt16BE = BP.writeInt16BE
  arr.writeInt32LE = BP.writeInt32LE
  arr.writeInt32BE = BP.writeInt32BE
  arr.writeFloatLE = BP.writeFloatLE
  arr.writeFloatBE = BP.writeFloatBE
  arr.writeDoubleLE = BP.writeDoubleLE
  arr.writeDoubleBE = BP.writeDoubleBE
  arr.fill = BP.fill
  arr.inspect = BP.inspect
  arr.toArrayBuffer = BP.toArrayBuffer

  return arr
}

var INVALID_BASE64_RE = /[^+\/0-9A-z]/g

function base64clean (str) {
  // Node strips out invalid characters like \n and \t from the string, base64-js does not
  str = stringtrim(str).replace(INVALID_BASE64_RE, '')
  // Node allows for non-padded base64 strings (missing trailing ===), base64-js does not
  while (str.length % 4 !== 0) {
    str = str + '='
  }
  return str
}

function stringtrim (str) {
  if (str.trim) return str.trim()
  return str.replace(/^\s+|\s+$/g, '')
}

function isArray (subject) {
  return (Array.isArray || function (subject) {
    return Object.prototype.toString.call(subject) === '[object Array]'
  })(subject)
}

function isArrayish (subject) {
  return isArray(subject) || Buffer.isBuffer(subject) ||
      subject && typeof subject === 'object' &&
      typeof subject.length === 'number'
}

function toHex (n) {
  if (n < 16) return '0' + n.toString(16)
  return n.toString(16)
}

function utf8ToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    var b = str.charCodeAt(i)
    if (b <= 0x7F) {
      byteArray.push(b)
    } else {
      var start = i
      if (b >= 0xD800 && b <= 0xDFFF) i++
      var h = encodeURIComponent(str.slice(start, i+1)).substr(1).split('%')
      for (var j = 0; j < h.length; j++) {
        byteArray.push(parseInt(h[j], 16))
      }
    }
  }
  return byteArray
}

function asciiToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    // Node's code seems to be doing this and not & 0x7F..
    byteArray.push(str.charCodeAt(i) & 0xFF)
  }
  return byteArray
}

function utf16leToBytes (str) {
  var c, hi, lo
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    c = str.charCodeAt(i)
    hi = c >> 8
    lo = c % 256
    byteArray.push(lo)
    byteArray.push(hi)
  }

  return byteArray
}

function base64ToBytes (str) {
  return base64.toByteArray(str)
}

function blitBuffer (src, dst, offset, length) {
  for (var i = 0; i < length; i++) {
    if ((i + offset >= dst.length) || (i >= src.length))
      break
    dst[i + offset] = src[i]
  }
  return i
}

function decodeUtf8Char (str) {
  try {
    return decodeURIComponent(str)
  } catch (err) {
    return String.fromCharCode(0xFFFD) // UTF 8 invalid char
  }
}

/*
 * We have to make sure that the value is a valid integer. This means that it
 * is non-negative. It has no fractional component and that it does not
 * exceed the maximum allowed value.
 */
function verifuint (value, max) {
  assert(typeof value === 'number', 'cannot write a non-number as a number')
  assert(value >= 0, 'specified a negative value for writing an unsigned value')
  assert(value <= max, 'value is larger than maximum value for type')
  assert(Math.floor(value) === value, 'value has a fractional component')
}

function verifsint (value, max, min) {
  assert(typeof value === 'number', 'cannot write a non-number as a number')
  assert(value <= max, 'value larger than maximum allowed value')
  assert(value >= min, 'value smaller than minimum allowed value')
  assert(Math.floor(value) === value, 'value has a fractional component')
}

function verifIEEE754 (value, max, min) {
  assert(typeof value === 'number', 'cannot write a non-number as a number')
  assert(value <= max, 'value larger than maximum allowed value')
  assert(value >= min, 'value smaller than minimum allowed value')
}

function assert (test, message) {
  if (!test) throw new Error(message || 'Failed assertion')
}

},{"base64-js":115,"ieee754":116}],115:[function(require,module,exports){
var lookup = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

;(function (exports) {
	'use strict';

  var Arr = (typeof Uint8Array !== 'undefined')
    ? Uint8Array
    : Array

	var PLUS   = '+'.charCodeAt(0)
	var SLASH  = '/'.charCodeAt(0)
	var NUMBER = '0'.charCodeAt(0)
	var LOWER  = 'a'.charCodeAt(0)
	var UPPER  = 'A'.charCodeAt(0)

	function decode (elt) {
		var code = elt.charCodeAt(0)
		if (code === PLUS)
			return 62 // '+'
		if (code === SLASH)
			return 63 // '/'
		if (code < NUMBER)
			return -1 //no match
		if (code < NUMBER + 10)
			return code - NUMBER + 26 + 26
		if (code < UPPER + 26)
			return code - UPPER
		if (code < LOWER + 26)
			return code - LOWER + 26
	}

	function b64ToByteArray (b64) {
		var i, j, l, tmp, placeHolders, arr

		if (b64.length % 4 > 0) {
			throw new Error('Invalid string. Length must be a multiple of 4')
		}

		// the number of equal signs (place holders)
		// if there are two placeholders, than the two characters before it
		// represent one byte
		// if there is only one, then the three characters before it represent 2 bytes
		// this is just a cheap hack to not do indexOf twice
		var len = b64.length
		placeHolders = '=' === b64.charAt(len - 2) ? 2 : '=' === b64.charAt(len - 1) ? 1 : 0

		// base64 is 4/3 + up to two characters of the original data
		arr = new Arr(b64.length * 3 / 4 - placeHolders)

		// if there are placeholders, only get up to the last complete 4 chars
		l = placeHolders > 0 ? b64.length - 4 : b64.length

		var L = 0

		function push (v) {
			arr[L++] = v
		}

		for (i = 0, j = 0; i < l; i += 4, j += 3) {
			tmp = (decode(b64.charAt(i)) << 18) | (decode(b64.charAt(i + 1)) << 12) | (decode(b64.charAt(i + 2)) << 6) | decode(b64.charAt(i + 3))
			push((tmp & 0xFF0000) >> 16)
			push((tmp & 0xFF00) >> 8)
			push(tmp & 0xFF)
		}

		if (placeHolders === 2) {
			tmp = (decode(b64.charAt(i)) << 2) | (decode(b64.charAt(i + 1)) >> 4)
			push(tmp & 0xFF)
		} else if (placeHolders === 1) {
			tmp = (decode(b64.charAt(i)) << 10) | (decode(b64.charAt(i + 1)) << 4) | (decode(b64.charAt(i + 2)) >> 2)
			push((tmp >> 8) & 0xFF)
			push(tmp & 0xFF)
		}

		return arr
	}

	function uint8ToBase64 (uint8) {
		var i,
			extraBytes = uint8.length % 3, // if we have 1 byte left, pad 2 bytes
			output = "",
			temp, length

		function encode (num) {
			return lookup.charAt(num)
		}

		function tripletToBase64 (num) {
			return encode(num >> 18 & 0x3F) + encode(num >> 12 & 0x3F) + encode(num >> 6 & 0x3F) + encode(num & 0x3F)
		}

		// go through the array every three bytes, we'll deal with trailing stuff later
		for (i = 0, length = uint8.length - extraBytes; i < length; i += 3) {
			temp = (uint8[i] << 16) + (uint8[i + 1] << 8) + (uint8[i + 2])
			output += tripletToBase64(temp)
		}

		// pad the end with zeros, but make sure to not forget the extra bytes
		switch (extraBytes) {
			case 1:
				temp = uint8[uint8.length - 1]
				output += encode(temp >> 2)
				output += encode((temp << 4) & 0x3F)
				output += '=='
				break
			case 2:
				temp = (uint8[uint8.length - 2] << 8) + (uint8[uint8.length - 1])
				output += encode(temp >> 10)
				output += encode((temp >> 4) & 0x3F)
				output += encode((temp << 2) & 0x3F)
				output += '='
				break
		}

		return output
	}

	exports.toByteArray = b64ToByteArray
	exports.fromByteArray = uint8ToBase64
}(typeof exports === 'undefined' ? (this.base64js = {}) : exports))

},{}],116:[function(require,module,exports){
exports.read = function(buffer, offset, isLE, mLen, nBytes) {
  var e, m,
      eLen = nBytes * 8 - mLen - 1,
      eMax = (1 << eLen) - 1,
      eBias = eMax >> 1,
      nBits = -7,
      i = isLE ? (nBytes - 1) : 0,
      d = isLE ? -1 : 1,
      s = buffer[offset + i];

  i += d;

  e = s & ((1 << (-nBits)) - 1);
  s >>= (-nBits);
  nBits += eLen;
  for (; nBits > 0; e = e * 256 + buffer[offset + i], i += d, nBits -= 8);

  m = e & ((1 << (-nBits)) - 1);
  e >>= (-nBits);
  nBits += mLen;
  for (; nBits > 0; m = m * 256 + buffer[offset + i], i += d, nBits -= 8);

  if (e === 0) {
    e = 1 - eBias;
  } else if (e === eMax) {
    return m ? NaN : ((s ? -1 : 1) * Infinity);
  } else {
    m = m + Math.pow(2, mLen);
    e = e - eBias;
  }
  return (s ? -1 : 1) * m * Math.pow(2, e - mLen);
};

exports.write = function(buffer, value, offset, isLE, mLen, nBytes) {
  var e, m, c,
      eLen = nBytes * 8 - mLen - 1,
      eMax = (1 << eLen) - 1,
      eBias = eMax >> 1,
      rt = (mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0),
      i = isLE ? 0 : (nBytes - 1),
      d = isLE ? 1 : -1,
      s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0;

  value = Math.abs(value);

  if (isNaN(value) || value === Infinity) {
    m = isNaN(value) ? 1 : 0;
    e = eMax;
  } else {
    e = Math.floor(Math.log(value) / Math.LN2);
    if (value * (c = Math.pow(2, -e)) < 1) {
      e--;
      c *= 2;
    }
    if (e + eBias >= 1) {
      value += rt / c;
    } else {
      value += rt * Math.pow(2, 1 - eBias);
    }
    if (value * c >= 2) {
      e++;
      c /= 2;
    }

    if (e + eBias >= eMax) {
      m = 0;
      e = eMax;
    } else if (e + eBias >= 1) {
      m = (value * c - 1) * Math.pow(2, mLen);
      e = e + eBias;
    } else {
      m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen);
      e = 0;
    }
  }

  for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8);

  e = (e << mLen) | m;
  eLen += mLen;
  for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8);

  buffer[offset + i - d] |= s * 128;
};

},{}],117:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

function EventEmitter() {
  this._events = this._events || {};
  this._maxListeners = this._maxListeners || undefined;
}
module.exports = EventEmitter;

// Backwards-compat with node 0.10.x
EventEmitter.EventEmitter = EventEmitter;

EventEmitter.prototype._events = undefined;
EventEmitter.prototype._maxListeners = undefined;

// By default EventEmitters will print a warning if more than 10 listeners are
// added to it. This is a useful default which helps finding memory leaks.
EventEmitter.defaultMaxListeners = 10;

// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
EventEmitter.prototype.setMaxListeners = function(n) {
  if (!isNumber(n) || n < 0 || isNaN(n))
    throw TypeError('n must be a positive number');
  this._maxListeners = n;
  return this;
};

EventEmitter.prototype.emit = function(type) {
  var er, handler, len, args, i, listeners;

  if (!this._events)
    this._events = {};

  // If there is no 'error' event listener then throw.
  if (type === 'error') {
    if (!this._events.error ||
        (isObject(this._events.error) && !this._events.error.length)) {
      er = arguments[1];
      if (er instanceof Error) {
        throw er; // Unhandled 'error' event
      } else {
        throw TypeError('Uncaught, unspecified "error" event.');
      }
      return false;
    }
  }

  handler = this._events[type];

  if (isUndefined(handler))
    return false;

  if (isFunction(handler)) {
    switch (arguments.length) {
      // fast cases
      case 1:
        handler.call(this);
        break;
      case 2:
        handler.call(this, arguments[1]);
        break;
      case 3:
        handler.call(this, arguments[1], arguments[2]);
        break;
      // slower
      default:
        len = arguments.length;
        args = new Array(len - 1);
        for (i = 1; i < len; i++)
          args[i - 1] = arguments[i];
        handler.apply(this, args);
    }
  } else if (isObject(handler)) {
    len = arguments.length;
    args = new Array(len - 1);
    for (i = 1; i < len; i++)
      args[i - 1] = arguments[i];

    listeners = handler.slice();
    len = listeners.length;
    for (i = 0; i < len; i++)
      listeners[i].apply(this, args);
  }

  return true;
};

EventEmitter.prototype.addListener = function(type, listener) {
  var m;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events)
    this._events = {};

  // To avoid recursion in the case that type === "newListener"! Before
  // adding it to the listeners, first emit "newListener".
  if (this._events.newListener)
    this.emit('newListener', type,
              isFunction(listener.listener) ?
              listener.listener : listener);

  if (!this._events[type])
    // Optimize the case of one listener. Don't need the extra array object.
    this._events[type] = listener;
  else if (isObject(this._events[type]))
    // If we've already got an array, just append.
    this._events[type].push(listener);
  else
    // Adding the second element, need to change to array.
    this._events[type] = [this._events[type], listener];

  // Check for listener leak
  if (isObject(this._events[type]) && !this._events[type].warned) {
    var m;
    if (!isUndefined(this._maxListeners)) {
      m = this._maxListeners;
    } else {
      m = EventEmitter.defaultMaxListeners;
    }

    if (m && m > 0 && this._events[type].length > m) {
      this._events[type].warned = true;
      console.error('(node) warning: possible EventEmitter memory ' +
                    'leak detected. %d listeners added. ' +
                    'Use emitter.setMaxListeners() to increase limit.',
                    this._events[type].length);
      if (typeof console.trace === 'function') {
        // not supported in IE 10
        console.trace();
      }
    }
  }

  return this;
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.once = function(type, listener) {
  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  var fired = false;

  function g() {
    this.removeListener(type, g);

    if (!fired) {
      fired = true;
      listener.apply(this, arguments);
    }
  }

  g.listener = listener;
  this.on(type, g);

  return this;
};

// emits a 'removeListener' event iff the listener was removed
EventEmitter.prototype.removeListener = function(type, listener) {
  var list, position, length, i;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events || !this._events[type])
    return this;

  list = this._events[type];
  length = list.length;
  position = -1;

  if (list === listener ||
      (isFunction(list.listener) && list.listener === listener)) {
    delete this._events[type];
    if (this._events.removeListener)
      this.emit('removeListener', type, listener);

  } else if (isObject(list)) {
    for (i = length; i-- > 0;) {
      if (list[i] === listener ||
          (list[i].listener && list[i].listener === listener)) {
        position = i;
        break;
      }
    }

    if (position < 0)
      return this;

    if (list.length === 1) {
      list.length = 0;
      delete this._events[type];
    } else {
      list.splice(position, 1);
    }

    if (this._events.removeListener)
      this.emit('removeListener', type, listener);
  }

  return this;
};

EventEmitter.prototype.removeAllListeners = function(type) {
  var key, listeners;

  if (!this._events)
    return this;

  // not listening for removeListener, no need to emit
  if (!this._events.removeListener) {
    if (arguments.length === 0)
      this._events = {};
    else if (this._events[type])
      delete this._events[type];
    return this;
  }

  // emit removeListener for all listeners on all events
  if (arguments.length === 0) {
    for (key in this._events) {
      if (key === 'removeListener') continue;
      this.removeAllListeners(key);
    }
    this.removeAllListeners('removeListener');
    this._events = {};
    return this;
  }

  listeners = this._events[type];

  if (isFunction(listeners)) {
    this.removeListener(type, listeners);
  } else {
    // LIFO order
    while (listeners.length)
      this.removeListener(type, listeners[listeners.length - 1]);
  }
  delete this._events[type];

  return this;
};

EventEmitter.prototype.listeners = function(type) {
  var ret;
  if (!this._events || !this._events[type])
    ret = [];
  else if (isFunction(this._events[type]))
    ret = [this._events[type]];
  else
    ret = this._events[type].slice();
  return ret;
};

EventEmitter.listenerCount = function(emitter, type) {
  var ret;
  if (!emitter._events || !emitter._events[type])
    ret = 0;
  else if (isFunction(emitter._events[type]))
    ret = 1;
  else
    ret = emitter._events[type].length;
  return ret;
};

function isFunction(arg) {
  return typeof arg === 'function';
}

function isNumber(arg) {
  return typeof arg === 'number';
}

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}

function isUndefined(arg) {
  return arg === void 0;
}

},{}],118:[function(require,module,exports){
// shim for using process in browser

var process = module.exports = {};

process.nextTick = (function () {
    var canSetImmediate = typeof window !== 'undefined'
    && window.setImmediate;
    var canPost = typeof window !== 'undefined'
    && window.postMessage && window.addEventListener
    ;

    if (canSetImmediate) {
        return function (f) { return window.setImmediate(f) };
    }

    if (canPost) {
        var queue = [];
        window.addEventListener('message', function (ev) {
            var source = ev.source;
            if ((source === window || source === null) && ev.data === 'process-tick') {
                ev.stopPropagation();
                if (queue.length > 0) {
                    var fn = queue.shift();
                    fn();
                }
            }
        }, true);

        return function nextTick(fn) {
            queue.push(fn);
            window.postMessage('process-tick', '*');
        };
    }

    return function nextTick(fn) {
        setTimeout(fn, 0);
    };
})();

process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;

process.binding = function (name) {
    throw new Error('process.binding is not supported');
}

// TODO(shtylman)
process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};

},{}]},{},[13])(13)
});