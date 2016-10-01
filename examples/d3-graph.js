"use strict";
var firebase = require('firebase');
var d3_selection_1 = require('d3-selection');
var d3_scale_1 = require('d3-scale');
var d3_axis_1 = require('d3-axis');
var d3_axis_2 = require("d3-axis");
var d3_shape_1 = require("d3-shape");
var d3_array_1 = require('d3-array');
var classes_1 = require("./classes");
var d3_transition_1 = require("d3-transition");
var d3_ease_1 = require("d3-ease");
var d3_path_1 = require("d3-path");
var styles = require('./styles.scss');
var classes = classes_1.Classes(styles);
var DAY = 86400000;
function getDay(timestamp) {
    return ((timestamp / DAY) >> 0) * DAY;
}
function app(elm) {
    elm.innerHTML = '';
    elm.className = elm.className.replace(classes.toString('container'), '') +
        ' ' + classes.toString('container');
    firebase.initializeApp(Sparks.firebase);
    var db = firebase.database();
    var metrics = db.ref('metrics');
    var margin = {
        top: 40, left: 40, bottom: 40, right: 40
    };
    var width;
    var height;
    var x = d3_scale_1.scaleLinear();
    var y = d3_scale_1.scaleLinear();
    var svg = d3_selection_1.select(elm)
        .append('div')
        .attr('class', classes.toString('chart'))
        .append('svg');
    var root = svg
        .append('g');
    var resolutionName = '1min';
    var xAxis = root.append('g')
        .attr('class', classes.toString('axis', 'axis-x'));
    var yAxis = root.append('g')
        .attr('class', classes.toString('axis', 'axis-y'));
    var dataLine = d3_shape_1.line()
        .x(function (d) { return x(d.bucket); })
        .y(function (d) { return y(d.value); });
    var gLine = root.append('g')
        .attr('class', classes.toString('line-group'));
    var data = [];
    var resolutions = {};
    resize();
    function resize() {
        var bounds = elm.getBoundingClientRect();
        width = bounds.width - margin.left - margin.right;
        height = bounds.height - margin.top - margin.bottom;
        svg
            .attr('width', width + margin.left + margin.right)
            .attr('height', height + margin.top + margin.bottom);
        root
            .attr('transform', "translate(" + margin.left + ", " + margin.top + ")");
        xAxis
            .attr('transform', "translate(0, " + height + ")");
        x.range([0, width]);
        y.range([height, 0]);
        draw();
    }
    function draw() {
        x.domain([0, d3_array_1.max(data, function (d) { return d.bucket; })]);
        y.domain([0, d3_array_1.max(data, function (d) { return d.value; })]);
        var day = getDay(Date.now());
        var res = resolutions[resolutionName];
        var xAxisData = d3_axis_1.axisBottom(x);
        var yAxisData = d3_axis_2.axisLeft(y);
        if (res) {
            var buckets_1 = res.buckets;
            xAxis.call(xAxisData
                .tickFormat(function (d) {
                var date = new Date(day + (day / buckets_1 * d));
                return ('0' + date.getHours()).slice(-2) + ":" + ('0' + date.getMinutes()).slice(-2);
            }));
        }
        else {
            xAxis.call(xAxisData);
        }
        yAxis.call(yAxisData);
        var bLine = root.selectAll(classes.sel('bline'))
            .data(x.ticks());
        var bLinePath = function (d) {
            var p = d3_path_1.path();
            p.moveTo(x(d), 0);
            p.lineTo(x(d), height);
            return p.toString();
        };
        bLine.attr('d', bLinePath);
        bLine.exit().remove();
        bLine.enter()
            .append('path')
            .attr('class', classes.toString('bline'))
            .attr('d', bLinePath);
        var vLine = gLine.selectAll(classes.sel('line'))
            .data([data]);
        vLine
            .transition(d3_transition_1.transition().duration(100).ease(d3_ease_1.easeLinear))
            .attr('d', dataLine);
        vLine.exit().remove();
        vLine.enter()
            .append('path')
            .attr('class', classes.toString('line'))
            .attr('d', dataLine);
    }
    metrics.child('resolutions')
        .on('value', function (snap) {
        resolutions = snap.val();
        gLine.append('path')
            .attr('class', classes.toString('line'));
        metrics.child('tag:queue-incoming')
            .child(String(getDay(Date.now())))
            .child(resolutionName)
            .on('value', function (snap) {
            data = snap.val()
                .map(function (v, i) { return ({ bucket: i, value: v }); })
                .filter(Boolean)
                .sort(function (a, b) { return a.bucket - b.bucket; });
            draw();
        });
    });
    return {
        resize: resize
    };
}
exports.app = app;
function start() {
    var container = document.querySelector('.sp-metric');
    if (container) {
        app(container);
    }
    else {
        setTimeout(start, 500);
    }
}
start();
