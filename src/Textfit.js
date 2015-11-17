import React, { createClass, PropTypes } from 'react';
import { findDOMNode } from 'react-dom';
import shallowEqual from './utils/shallowEqual';
import series from './utils/series';
import whilst from './utils/whilst';
import throttle from './utils/throttle';
import uniqueId from './utils/uniqueId';
import { innerWidth, innerHeight } from './utils/innerSize';

function assertElementFitsWidth(el, width) {
    return el.scrollWidth <= width;
}

function assertElementFitsHeight(el, height) {
    return el.scrollHeight <= height;
}

function noop() {}

export default createClass({

    displayName: 'Textfit',

    propTypes: {
        children: PropTypes.oneOfType([
            PropTypes.string,
            PropTypes.func
        ]),
        text: PropTypes.string,
        min: PropTypes.number,
        max: PropTypes.number,
        mode: PropTypes.oneOf([
            'single', 'multi'
        ]),
        forceSingleModeWidth: PropTypes.bool,
        perfectFit: PropTypes.bool,
        throttle: PropTypes.number,
        onReady: PropTypes.func
    },

    getDefaultProps() {
        return {
            min: 1,
            max: 100,
            mode: 'multi',
            forceSingleModeWidth: true,
            perfectFit: true,
            throttle: 50,
            onReady: noop
        };
    },

    getInitialState() {
        return {
            fontSize: null
        };
    },

    componentWillMount() {
        this.handleWindowResize = throttle(this.handleWindowResize, this.props.throttle);
    },

    componentDidMount() {
        window.addEventListener('resize', this.handleWindowResize);
        this.process();
    },

    shouldComponentUpdate(nextProps, nextState) {
        if (!this.ready) return true;
        const dataChanged = !shallowEqual(this.props, nextProps) || !shallowEqual(this.state, nextState);
        return dataChanged;
    },

    componentDidUpdate() {
        if (!this.ready) return;
        this.process();
    },

    componentWillUnmount() {
        // Setting a new pid will cancel all running processes
        this.pid = uniqueId();
        window.removeEventListener('resize', this.handleWindowResize);
    },

    handleWindowResize() {
        this.process();
    },

    process() {
        const { min, max, mode, forceSingleModeWidth, perfectFit, onReady } = this.props;
        const el = findDOMNode(this);
        const { wrapper } = this.refs;

        const originalWidth = innerWidth(el);
        const originalHeight = innerHeight(el);

        if (originalHeight <= 0) {
            console.warn('Can not process element without height. Make sure the element is displayed and has a static height.');
            return;
        }

        if (originalWidth <= 0) {
            console.warn('Can not process element without width. Make sure the element is displayed and has a static width.');
            return;
        }

        const pid = uniqueId();
        this.pid = pid;
        this.ready = false;
        const shouldCancelProcess = () => pid !== this.pid;

        const testPrimary = mode === 'multi'
            ? () => assertElementFitsHeight(wrapper, originalHeight)
            : () => assertElementFitsWidth(wrapper, originalWidth);

        const testSecondary = mode === 'multi'
            ? () => assertElementFitsWidth(wrapper, originalWidth)
            : () => assertElementFitsHeight(wrapper, originalHeight);

        let mid;
        let low = min;
        let high = max;

        series([
            // Step 1:
            // Binary search to fit the element's height (multi line) / width (single line)
            stepCallback => whilst(
                () => low <= high,
                whilstCallback => {
                    if (shouldCancelProcess()) return whilstCallback(true);
                    mid = parseInt((low + high) / 2, 10);
                    this.setState({ fontSize: mid }, () => {
                        if (shouldCancelProcess()) return whilstCallback(true);
                        if (testPrimary()) low = mid + 1;
                        else high = mid - 1;
                        return whilstCallback();
                    });
                },
                stepCallback
            ),
            // Step 2:
            // Binary search to fit the element's width (multi line) / height (single line)
            // If mode is single and forceSingleModeWidth is true, skip this step
            // in order to not fit the elements height and decrease the width
            stepCallback => {
                if (mode === 'single' && forceSingleModeWidth) return stepCallback();
                if (testSecondary()) return stepCallback();
                low = min;
                high = mid;
                return whilst(
                    () => low <= high,
                    whilstCallback => {
                        if (shouldCancelProcess()) return whilstCallback(true);
                        mid = parseInt((low + high) / 2, 10);
                        this.setState({ fontSize: mid }, () => {
                            if (pid !== this.pid) return whilstCallback(true);
                            if (testSecondary()) low = mid + 1;
                            else high = mid - 1;
                            return whilstCallback();
                        });
                    },
                    stepCallback
                );
            },
            // Step 3
            // Sometimes the text still overflows the elements bounds.
            // If perfectFit is true, decrease fontSize until it fits.
            stepCallback => {
                if (!perfectFit) return stepCallback();
                if (testPrimary()) return stepCallback();
                whilst(
                    () => !testPrimary(),
                    whilstCallback => {
                        if (shouldCancelProcess()) return whilstCallback(true);
                        this.setState({ fontSize: --mid }, whilstCallback);
                    },
                    stepCallback
                );
            },
            // Step 4
            // Make sure fontSize is always greater than 0
            stepCallback => {
                if (mid > 0) return stepCallback();
                this.setState({ fontSize: 1 }, stepCallback);
            }
        ], err => {
            // err will be true, if another process was triggered
            if (err) return;
            this.ready = true;
            onReady(mid);
        });
    },

    render() {
        console.log('render');
        const { children, text, style, min, max, mode, ...props } = this.props;
        const { fontSize } = this.state;
        const finalStyle = {
            ...style,
            fontSize: fontSize
        };

        const wrapperStyle = {
            display: 'inline-block'
        };
        if (mode === 'single') wrapperStyle.whiteSpace = 'nowrap';

        return (
            <div style={finalStyle} {...props}>
                <span ref="wrapper" style={wrapperStyle}>
                    {!!text && typeof children === 'function'
                        ? children(text)
                        : children
                    }
                </span>
            </div>
        );
    }
});