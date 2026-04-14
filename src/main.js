// 应用入口：
// 1. 先加载全局样式；
// 2. 再挂载根组件到 `#app` 节点。
import { createApp } from 'vue'
import './style.css'
import App from './App.vue'

// 这里不做额外插件注册，保持入口尽可能简单。
createApp(App).mount('#app')
