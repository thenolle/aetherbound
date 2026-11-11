import type { HudLine, Tone } from './hud-text'

const COLORS: Readonly<Record<Tone, string>> = {
  normal: '#e8dcc0',
  dim: '#8a8374',
  accent: '#6fd3e8',
  warn: '#e0894a'
}

const BACKGROUND = '#14161a'
const FONT_PX = 15

const VERTEX = `#version 300 es
out vec2 uv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  uv = vec2(p.x, 1.0 - p.y);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`

const FRAGMENT = `#version 300 es
precision mediump float;
in vec2 uv;
uniform sampler2D tex;
out vec4 color;
void main() {
  color = texture(tex, uv);
}`

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)
  if (shader === null) throw new Error('shader allocation failed')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? 'shader compile failed')
  return shader
}

function link(gl: WebGL2RenderingContext, vertex: WebGLShader, fragment: WebGLShader): WebGLProgram {
  const program = gl.createProgram()
  if (program === null) throw new Error('program allocation failed')
  gl.attachShader(program, vertex)
  gl.attachShader(program, fragment)
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? 'program link failed')
  return program
}

export type Frame = Readonly<{ width: number, height: number }>

export class Presenter {
  readonly pen: CanvasRenderingContext2D
  private readonly canvas: HTMLCanvasElement
  private readonly gl: WebGL2RenderingContext
  private readonly program: WebGLProgram
  private readonly texture: WebGLTexture
  private readonly surface: HTMLCanvasElement

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2')
    if (gl === null) throw new Error('WebGL2 is not available in this browser')
    const surface = document.createElement('canvas')
    const pen = surface.getContext('2d')
    if (pen === null) throw new Error('2D canvas is not available in this browser')
    const texture = gl.createTexture()
    if (texture === null) throw new Error('texture allocation failed')
    this.canvas = canvas
    this.gl = gl
    this.surface = surface
    this.pen = pen
    this.texture = texture
    this.program = link(gl, compile(gl, gl.VERTEX_SHADER, VERTEX), compile(gl, gl.FRAGMENT_SHADER, FRAGMENT))
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  }

  frame(): Frame {
    const ratio = window.devicePixelRatio || 1
    const width = Math.max(1, Math.floor(window.innerWidth * ratio))
    const height = Math.max(1, Math.floor(window.innerHeight * ratio))
    if (width !== this.canvas.width || height !== this.canvas.height) {
      this.canvas.width = width
      this.canvas.height = height
      this.surface.width = width
      this.surface.height = height
      this.canvas.style.width = `${window.innerWidth}px`
      this.canvas.style.height = `${window.innerHeight}px`
    }
    this.pen.setTransform(ratio, 0, 0, ratio, 0, 0)
    return { width: window.innerWidth, height: window.innerHeight }
  }

  present(): void {
    const { gl, canvas } = this
    gl.bindTexture(gl.TEXTURE_2D, this.texture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.surface)
    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.useProgram(this.program)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }
}

export class HudRenderer {
  private readonly presenter: Presenter

  constructor(presenter: Presenter) {
    this.presenter = presenter
  }

  draw(lines: readonly HudLine[]): void {
    const { width, height } = this.presenter.frame()
    const { pen } = this.presenter
    pen.fillStyle = BACKGROUND
    pen.fillRect(0, 0, width, height)
    pen.font = `${FONT_PX}px monospace`
    pen.textBaseline = 'top'
    let y = 12
    for (const line of lines) {
      pen.fillStyle = COLORS[line.tone]
      pen.fillText(line.text, 14, y)
      y += FONT_PX * 1.4
    }
    this.presenter.present()
  }
}