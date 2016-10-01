import * as firebase from 'firebase'
import Database = firebase.database.Database
import Reference = firebase.database.Reference

import {select} from 'd3-selection'
import {scaleLinear} from 'd3-scale'
import {axisBottom} from 'd3-axis'
import {axisLeft} from "d3-axis"
import {line} from "d3-shape"
import {max} from 'd3-array'
import {Classes} from "./classes";
import {transition} from "d3-transition";
import {easeLinear} from "d3-ease";
import {path} from "d3-path";

const styles = require<any>('./styles.scss')
const classes = Classes(styles)

declare var Sparks:any

interface Resolution {
  buckets:number
  keep?:number
  days?:{[index:number]:number}
}
type Resolutions = {[name:string]:Resolution}

interface Value {
  bucket:number
  value:number
}

const DAY = 86400000

function getDay(timestamp:number):number {
  return ((timestamp / DAY) >> 0) * DAY
}

export function app(elm:Element) {
  elm.innerHTML = ''
  elm.className = elm.className.replace(classes.toString('container'), '') +
    ' ' + classes.toString('container')

  firebase.initializeApp(Sparks.firebase)
  const db: Database = firebase.database()
  const metrics: Reference = db.ref('metrics')

  const margin = {
    top: 40, left: 40, bottom: 40, right: 40
  }
  let width
  let height

  const x = scaleLinear()
  const y = scaleLinear()

  const svg = select(elm)
    .append('div')
    .attr('class', classes.toString('chart'))
    .append('svg')

  const root = svg
    .append('g')

  const resolutionName = '1min'

  const xAxis = root.append('g')
    .attr('class', classes.toString('axis', 'axis-x'))

  const yAxis = root.append('g')
    .attr('class', classes.toString('axis', 'axis-y'))

  const dataLine = line()
    .x(d => x((d as Value).bucket) as number)
    .y(d => y((d as Value).value) as number)

  const gLine = root.append('g')
    .attr('class', classes.toString('line-group'))

  let data: Value[] = []
  let resolutions: Resolutions = {}
  resize()

  function resize() {
    const bounds = elm.getBoundingClientRect()
    width = bounds.width - margin.left - margin.right
    height = bounds.height - margin.top - margin.bottom

    svg
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)

    root
      .attr('transform', `translate(${margin.left}, ${margin.top})`)

    xAxis
      .attr('transform', `translate(0, ${height})`)

    x.range([0, width])
    y.range([height, 0])

    draw()
  }

  function draw() {
    x.domain([0, max(data, d => d.bucket)])
    y.domain([0, max(data, d => d.value)])

    const day = getDay(Date.now())
    const res = resolutions[resolutionName]

    const xAxisData = axisBottom(x)
    const yAxisData = axisLeft(y)

    if (res) {
      const buckets = res.buckets
      xAxis.call(xAxisData
        .tickFormat(d => {
          const date = new Date(day + (day / buckets * d))
          return `${('0' + date.getHours()).slice(-2)}:${('0' + date.getMinutes()).slice(-2)}`
        })
      )
    } else {
      xAxis.call(xAxisData)
    }

    yAxis.call(yAxisData)

    const bLine = root.selectAll(classes.sel('bline'))
      .data(x.ticks())
    const bLinePath = d => {
      const p = path()
      p.moveTo(x(d) as number, 0)
      p.lineTo(x(d) as number, height)
      return p.toString()
    }

    bLine.attr('d', bLinePath)
    bLine.exit().remove()
    bLine.enter()
      .append('path')
      .attr('class', classes.toString('bline'))
      .attr('d', bLinePath)

    const vLine = gLine.selectAll(classes.sel('line'))
      .data([data])

    vLine
      .transition(transition().duration(100).ease(easeLinear))
      .attr('d', dataLine)

    vLine.exit().remove()
    vLine.enter()
      .append('path')
      .attr('class', classes.toString('line'))
      .attr('d', dataLine)
  }

  metrics.child('resolutions')
    .on('value', snap => {
      resolutions = snap.val() as Resolutions

      gLine.append('path')
        .attr('class', classes.toString('line'))

      metrics.child('tag:queue-incoming')
        .child(String(getDay(Date.now())))
        .child(resolutionName)
        .on('value', snap => {
          data = (snap.val() as number[])
            .map((v, i) => ({bucket: i, value: v}))
            .filter(Boolean)
            .sort((a, b) => a.bucket - b.bucket)

          draw()
        })
    })

  return {
    resize
  }
}

function start() {
  const container = document.querySelector('.sp-metric')
  if (container) {
    app(container)
  } else {
    setTimeout(start, 500)
  }
}

start()