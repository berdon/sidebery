<template lang="pug">
.ToggleField(:data-inline="inline" :data-inactive="inactive" @click="toggle")
  .label(:style="{ color }") {{t(label)}}
  toggle-input.input(:value="value")
</template>


<script>
import ToggleInput from './toggle-input'

export default {
  components: {
    ToggleInput,
  },

  props: {
    value: Boolean,
    label: String,
    inactive: Boolean,
    field: Boolean,
    inline: Boolean,
    color: String,
  },

  data() {
    return {}
  },

  methods: {
    toggle() {
      if (this.inactive) return
      this.$emit('input', !this.value)
    },
  },
}
</script>
