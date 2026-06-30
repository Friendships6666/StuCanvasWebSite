import { defineConfig } from 'vitepress'

export default defineConfig({
  title: "StuCanvas",
  description: "一个基于 Vulkan 的现代化、高性能、全方位科学可视化引擎。",
  appearance: true,
  ignoreDeadLinks: true,

  head: [
    ['script', {}, `
;(function() {
  var KEY = 'stucanvas-code-wrap'
  function getW() { return localStorage.getItem(KEY) === 'true' }
  function setW(v) { localStorage.setItem(KEY, String(v)) }

  function wrapAll(wrap) {
    document.querySelectorAll('.vp-doc .vp-code').forEach(function(el) {
      el.style.whiteSpace = wrap ? 'pre-wrap' : 'pre'
      el.style.wordBreak = wrap ? 'break-all' : 'normal'
    })
  }

  function updateAll() {
    document.querySelectorAll('.code-wrap-btn').forEach(function(btn) {
      var w = getW()
      btn.textContent = w ? '折行: 开' : '折行: 关'
      if (w) { btn.classList.add('active') } else { btn.classList.remove('active') }
    })
  }

  function addOne(codeGroup) {
    if (codeGroup.querySelector('.code-wrap-btn')) return
    var copyBtn = codeGroup.querySelector('button.copy')
    if (!copyBtn) return
    var btn = document.createElement('button')
    btn.className = 'code-wrap-btn'
    btn.title = '切换软换行'
    btn.onclick = function() {
      var next = !getW()
      setW(next)
      wrapAll(next)
      updateAll()
    }
    copyBtn.parentNode.insertBefore(btn, copyBtn)
  }

  function scanAll() {
    document.querySelectorAll('.vp-code-group').forEach(addOne)
  }

  // 初始扫描 + MutationObserver 监听动态加载
  wrapAll(getW())
  scanAll()
  updateAll()
  var obs = new MutationObserver(scanAll)
  obs.observe(document.body, { childList: true, subtree: true })
})();
`]
  ],

  markdown: {
    math: true, // 开启官方原生的数学公式支持
    theme: {
      dark: 'material-theme-palenight',
      light: 'material-theme-lighter'
    },
    code: {
      lineNumbers: true
    }
  },



  themeConfig: {
    nav: [
      { text: '文档说明', link: '/' },
      {
        text: '工具箱',
        items: [
          { text: '文件加解密', link: '/crypto/index.html', target: '_blank' }
        ]
      },
      { text: 'GitHub', link: 'https://github.com/friendships6666/StuCanvas' }
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/friendships6666/StuCanvas' }
    ],


    search: {
      provider: 'local'
    },

    // 左侧侧边栏，包含您的核心硬核功能模块
    sidebar: [
      {
        text: '开始使用',
        collapsed: true,
        items: [
          { text: 'StuCanvas 简介', link: '/' },
          { text: '安装指南', link: '/getting-started/install' },
          { text: '快速开始', link: '/getting-started/quick-start' },
        ]
      },
      {
        text: '代数与几何',
        collapsed: true,
        items: [
          {
            text: '动态几何构建',
            collapsed: true,
            items: [
              { text: '直线和圆', link: '/modules/dynamic-geometry/lines-circles' },
              { text: '求解器对象', link: '/modules/dynamic-geometry/solver' },
              { text: '三维物体', link: '/modules/dynamic-geometry/3d-objects' },
              { text: '圆锥曲线', link: '/modules/dynamic-geometry/conics' }
            ]
          },
          {
            text: '数学函数绘制',
            collapsed: true,
            items: [
              { text: '显函数与隐函数', link: '/modules/function-plotting/explicit-implicit' },
              { text: '参数方程', link: '/modules/function-plotting/parametric' }
            ]
          }
        ]
      },
      {
        text: '世界映射',
        collapsed: true,
        items: [
          { text: 'RTS变换', link: '/modules/world_transformation/rts-transform' },
          { text: '相机变换', link: '/modules/world_transformation/camera-transform' },
        ]
      },
      {
        text: '渲染与导出',
        collapsed: true,
        items: [
          { text: '视觉属性', link: '/modules/visual-properties' },
          { text: 'OpenPBR 材质渲染', link: '/modules/openpbr' },
          { text: '视频导出', link: '/modules/video-export' }
        ]
      },
      {
        text: '动画系统',
        collapsed: true,
        items: [
          { text: '简单线性动画', link: '/modules/animation/simple-linear' },
          { text: '贝塞尔缓动', link: '/modules/animation/bezier-easing' },
          { text: '书写动画', link: '/modules/animation/handwriting' },
          { text: '形变动画', link: '/modules/animation/morph' },
        ]
      },
      {
        text: '文字与排版',
        collapsed: true,
        items: [
          { text: '单行文字构建', link: '/modules/text/single-line' },
          { text: 'Typst排版', link: '/modules/text/typst-typesetting' }
        ]
      },
      {
        text: '计算几何',
        collapsed: true,
        items: [
          { text: '凸包', link: '/modules/computational-geometry/convex-hull' },
          { text: '布尔运算', link: '/modules/computational-geometry/boolean' },
          { text: '三角剖分', link: '/modules/computational-geometry/triangulation' }
        ]
      },
      {
        text: '实时交互',
        collapsed: true,
        items: [
          { text: '自由点', link: '/modules/interaction/free-point' },
          { text: '滑动条', link: '/modules/interaction/slider' }
        ]
      },
      {
        text: '科学模拟',
        collapsed: true,
        items: [
          { text: '物理模拟', link: '/modules/physical-simulation' },
          { text: '化学与分子模拟', link: '/modules/chemical-simulation' }
        ]
      },
    ],

    outline: {
      level: [2, 3],
      label: '本页大纲'
    },

    editLink: {
      pattern: 'https://github.com/friendships6666/StuCanvas/edit/main/docs/:path',
      text: '编辑此页'
    },

    docFooter: {
      prev: '上一页',
      next: '下一页'
    }
  }
})