<template>
    <div
        class="item-container-base"
        tabindex="0"
        :class="{ selected: isSelected, hovering: isHovering, focussed: isFocused }"
        :title="itemTitle"
        @blur="hideFocus"
        @click="toggleSelection"
        @focus="showFocus"
        @keydown.enter="toggleSelection"
        @mouseover="isHovering = true"
        @mouseout="isHovering = false"
    >
        <div class="icon">
            <svg
                v-if="itemType === LoginOption.BUILDER_ID"
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
            >
                <path
                    class="svg-path"
                    fill-rule="evenodd"
                    clip-rule="evenodd"
                    d="M8 2C6.68228 2 5.61 3.07228 5.61 4.39C5.61 5.70772 6.68228 6.78 8 6.78C9.31771 6.78 10.39 5.70772 10.39 4.39C10.39 3.07228 9.31772 2 8 2ZM3.61 4.39C3.61 1.96772 5.57771 0 8 0C10.4223 0 12.39 1.96771 12.39 4.39C12.39 5.66447 11.8453 6.81311 10.9762 7.61551C11.1666 7.71116 11.3535 7.81608 11.5368 7.93001C13.5215 9.15787 15 11.3598 15 14V15H1V14C1 11.147 2.63919 8.7213 4.99701 7.59061C4.14356 6.78943 3.61 5.65134 3.61 4.39ZM10.482 9.62922C9.71501 9.15233 8.88729 8.90797 8.00229 8.91L8 8.91C5.59623 8.91 3.5507 10.634 3.09474 13H12.8975C12.601 11.5742 11.6867 10.3744 10.484 9.63047L10.482 9.62922Z"
                />
            </svg>
            <svg
                v-if="itemType === LoginOption.ENTERPRISE_SSO"
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
            >
                <path
                    class="svg-path"
                    fill-rule="evenodd"
                    clip-rule="evenodd"
                    d="M4 3C3.44772 3 3 3.44772 3 4C3 4.55229 3.44772 5 4 5C4.55228 5 5 4.55229 5 4C5 3.44772 4.55228 3 4 3ZM1 4C1 2.34315 2.34315 1 4 1C5.65685 1 7 2.34315 7 4C7 5.65676 5.65701 6.99984 4.00029 7C6.21244 7.00016 8 8.78781 8 11C8 8.78772 9.78771 7 12 7C14.2123 7 16 8.78772 16 11V14C16 14.5523 15.5523 15 15 15H9C8.44771 15 8 14.5523 8 14C8 14.5523 7.55228 15 7 15H1C0.447715 15 0 14.5523 0 14V11C0 8.78772 1.78801 7 4.00029 7C2.34344 7 1 5.65685 1 4ZM12 7C10.3431 7 9 5.65685 9 4C9 2.34315 10.3431 1 12 1C13.6569 1 15 2.34315 15 4C15 5.65685 13.6569 7 12 7ZM11 4C11 3.44772 11.4477 3 12 3C12.5523 3 13 3.44772 13 4C13 4.55229 12.5523 5 12 5C11.4477 5 11 4.55229 11 4ZM10 11C10 9.89228 10.8923 9 12 9C13.1077 9 14 9.89228 14 11V13H10V11ZM2 11C2 9.89228 2.89228 9 4 9C5.10772 9 6 9.89228 6 11V13H2V11Z"
                />
            </svg>
            <svg
                v-if="itemType === LoginOption.IAM_CREDENTIAL"
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
            >
                <path
                    class="svg-path"
                    fill-rule="evenodd"
                    clip-rule="evenodd"
                    d="M10.0042 11C10.0042 11.009 10.002 11.0325 9.99974 11.0548L9.99979 11.0502L10 11L10 10.9993L9.99997 11L9.995 11.1L9.99652 11.0855L9.99974 11.0548C9.978 13.1703 8.62586 15.046 6.62064 15.7331C4.59789 16.4261 2.3583 15.7562 1.0483 14.0663C-0.261694 12.3764 -0.352147 10.0406 0.823246 8.25441C1.89701 6.62271 3.81005 5.77972 5.71121 6.05367L12.3412 0.24769C12.5235 0.0880192 12.7576 0 13 0H15C15.5523 0 16 0.447715 16 1V6C16 6.55228 15.5523 7 15 7H14V8C14 8.55229 13.5523 9 13 9H12V10C12 10.5523 11.5523 11 11 11H10.0042ZM13.376 2L6.65881 7.88231C6.41017 8.10005 6.07001 8.18087 5.75 8.09825C4.50783 7.77752 3.19918 8.28216 2.49395 9.35384C1.78871 10.4255 1.84298 11.827 2.62898 12.841C3.41498 13.8549 4.75873 14.2569 5.97239 13.841C7.18604 13.4252 8.00096 12.2837 8 11.0007L8.00502 10.9C8.03175 10.634 8.03175 10.366 8.00502 10.1C7.94583 9.51115 8.40818 9 9 9H10V8C10 7.44772 10.4477 7 11 7H12V6C12 5.44772 12.4477 5 13 5H14V2H13.376ZM6 10H4V12H6V10Z"
                />
            </svg>
        </div>
        <div class="text">
            <div class="title">
                {{ itemTitle }}
                <template v-if="itemSubTitle">
                    - <i>{{ itemSubTitle }}</i>
                </template>
            </div>
            <div class="p" v-if="itemText" :title="itemText">{{ itemText }}</div>
        </div>
    </div>
</template>

<script lang="ts">
import { LoginOption } from './types'
import { defineComponent } from 'vue'
export default defineComponent({
    name: 'SelectableItem',
    components: {},
    props: {
        itemId: Number,
        itemText: String,
        itemTitle: String,
        itemSubTitle: String,
        itemType: Number,
        isSelected: Boolean,
        isHovering: Boolean,
    },
    data() {
        return {
            itemId: this.itemId,
            itemTitle: this.itemTitle,
            itemSubTitle: this.itemSubTitle,
            itemText: this.itemText,
            isSelected: this.isSelected,
            isHovering: false,
            isFocused: false,
            LoginOption,
        }
    },
    async created() {},
    methods: {
        toggleSelection() {
            this.$emit('toggle', this.itemId)
        },
        hideFocus(event: Event) {
            event.stopPropagation()
            this.isFocused = false
        },
        showFocus(event: Event) {
            event.stopPropagation()
            if (!this.isHovering) {
                this.isFocused = true
            }
        },
    },
})
</script>

<style scoped>
.item-container-base {
    display: flex;
    border-width: 1px;
    border-style: solid;
    border-color: #625f5f;
    user-select: none;
    /* Some items do not have itemText, so we need a consistent height for all items */
    height: 50px;
    position: relative;
}
.item-container-base.focussed::before {
    content: attr(title);
    cursor: default;
    display: block;
    font-size: var(--font-size-sm);
    height: auto;
    max-width: 130px;
    padding: 5px;
    position: absolute;
    right: 0;
    transform: translate(0, -100%);
    word-break: break-all;
}

.vscode-dark .item-container-base.focussed:before,
body.vscode-high-contrast:not(body.vscode-high-contrast-light) .item-container-base.focussed:before {
    background-color: white;
    color: rgba(0, 0, 0, 0.8);
}
.vscode-light .item-container-base.focussed:before,
body.vscode-high-contrast-light .item-container-base.focussed:before {
    background-color: rgba(255, 255, 255, 0.8);
    color: black;
}

.hovering {
    border-color: #0e639c;
}

.selected {
    border-color: #3675f4;
}

.title {
    font-size: var(--font-size-base);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-bottom: 0.2rem;
}

.p {
    font-weight: var(--font-size-base);
    margin-top: 0.2rem;
    text-align: justify;
}

.text {
    display: flex;
    flex-direction: column;
    font-size: var(--font-size-sm);
    justify-content: center;
    overflow: hidden;
}

.vscode-dark .text {
    color: white;
}
.vscode-light .text {
    color: black;
}
.icon {
    padding-left: 8px;
    padding-right: 11px;
    display: flex;
    align-items: center;
}
.vscode-dark .icon .svg-path,
body.vscode-high-contrast:not(body.vscode-high-contrast-light) .icon .svg-path {
    fill: white;
}
.vscode-light .icon .svg-path,
body.vscode-high-contrast-light .icon .svg-path {
    fill: black;
}

.item-container-base .text .p {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
</style>
