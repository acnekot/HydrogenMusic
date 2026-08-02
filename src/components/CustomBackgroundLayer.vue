<script setup>
import { computed } from 'vue'

const props = defineProps({
    active: { type: Boolean, default: false },
    image: { type: String, default: '' },
    mode: { type: String, default: 'cover' },
    blur: { type: Number, default: 0 },
    brightness: { type: Number, default: 100 },
})

const imageUrl = computed(() => {
    if (!props.active || !props.image) return ''
    try {
        return windowApi?.toFileUrl?.(props.image) || ''
    } catch (_) {
        return ''
    }
})

const backgroundSize = computed(() => {
    if (props.mode === 'stretch') return '100% 100%'
    if (props.mode === 'center') return 'auto'
    return props.mode === 'contain' ? 'contain' : 'cover'
})

const layerStyle = computed(() => ({
    backgroundImage: imageUrl.value ? `url("${imageUrl.value.replace(/"/g, '%22')}")` : 'none',
    backgroundSize: backgroundSize.value,
    filter: `blur(${Math.max(0, Number(props.blur) || 0)}px) brightness(${Math.max(10, Number(props.brightness) || 100)}%)`,
    transform: Number(props.blur) > 0 ? 'scale(1.08)' : 'none',
}))
</script>

<template>
    <div v-if="imageUrl" class="custom-background-layer" :style="layerStyle" aria-hidden="true"></div>
</template>

<style scoped>
.custom-background-layer {
    position: absolute;
    inset: 0;
    z-index: 0;
    background-position: center;
    background-repeat: no-repeat;
    transform-origin: center;
    pointer-events: none;
    will-change: filter, transform;
}
</style>
