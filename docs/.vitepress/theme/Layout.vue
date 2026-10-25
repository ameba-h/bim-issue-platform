<script setup>
import DefaultTheme from 'vitepress/theme'
import { withBase } from 'vitepress'

const { Layout } = DefaultTheme
</script>

<template>
  <Layout>
    <template #not-found>
      <div class="nf">
        <h1>404</h1>
        <p class="msg">这个地址下没有页面 —— 站点还很新，有些内容可能还没写进来。</p>
        <p class="acts">
          <a :href="withBase('/')">回首页</a>
          <span>或按 <kbd>Ctrl</kbd> <kbd>K</kbd> 搜全站</span>
        </p>
      </div>
    </template>
  </Layout>
</template>

<style scoped>
.nf {
  max-width: 512px;
  margin: 0 auto;
  padding: 96px 24px;
  text-align: center;
}

.nf h1 {
  margin: 0 0 12px;
  font-size: 64px;
  line-height: 1;
  letter-spacing: 2px;
  color: var(--vp-c-brand-1);
}

.msg {
  margin: 0 0 20px;
  font-size: 15px;
  color: var(--vp-c-text-2);
}

.acts {
  display: flex;
  gap: 16px;
  justify-content: center;
  align-items: center;
  margin: 0;
  font-size: 14px;
  color: var(--vp-c-text-3);
}

.acts a {
  font-weight: 600;
  color: var(--vp-c-brand-1);
  text-decoration: none;
}

.acts a:hover {
  text-decoration: underline;
}

kbd {
  padding: 1px 5px;
  border: 1px solid var(--vp-c-divider);
  border-bottom-width: 2px;
  border-radius: 4px;
  font-family: var(--vp-font-family-mono);
  font-size: 12px;
}
</style>
