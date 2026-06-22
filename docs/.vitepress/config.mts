import { defineConfig } from 'vitepress'

export default defineConfig({
  title: "StuCanvas",
  description: "A modern, high-performance, Vulkan-based comprehensive engine for scientific visualization.",
  appearance: true,
  ignoreDeadLinks: true,

  themeConfig: {
    nav: [
      { text: 'Documentation', link: '/' },
      { text: 'GitHub', link: 'https://github.com/friendships6666/StuCanvas' }
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/friendships6666/StuCanvas' }
    ],

    search: {
      provider: 'local'
    },

    // 重新定义左侧侧边栏，将您的硬核功能作为核心章节列出
    sidebar: [
      {
        text: 'Getting Started',
        collapsed: false,
        items: [
          { text: 'Introducing StuCanvas', link: '/' }, // 首页 index.md 作为介绍页
          { text: 'Installation', link: '/getting-started/install' },
          { text: 'Quick Start', link: '/getting-started/quick-start' }
        ]
      },
      {
        text: 'Mathematical & Geometry',
        collapsed: false,
        items: [
          { text: 'Parametric Modeling', link: '/modules/parametric-modeling' },
          { text: 'Dynamic Geometry Creation', link: '/modules/dynamic-geometry' },
          { text: 'Mathematical Function Plotting', link: '/modules/function-plotting' }
        ]
      },
      {
        text: 'Scientific Simulations',
        collapsed: false,
        items: [
          { text: 'Physical Simulation', link: '/modules/physical-simulation' },
          { text: 'Chemical & Molecular Simulation', link: '/modules/chemical-simulation' }
        ]
      },
      {
        text: 'Rendering & Export',
        collapsed: false,
        items: [
          { text: 'OpenPBR Material Rendering', link: '/modules/openpbr' },
          { text: 'High-Performance Video Export', link: '/modules/video-export' }
        ]
      }
    ],

    outline: {
      level: [2, 3],
      label: 'On this page'
    },

    editLink: {
      pattern: 'https://github.com/friendships666/StuCanvas/edit/main/docs/:path',
      text: 'Edit this page'
    },

    docFooter: {
      prev: 'Previous',
      next: 'Next'
    }
  }
})