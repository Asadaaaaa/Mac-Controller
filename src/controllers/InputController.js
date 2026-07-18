const robot = require('robotjs');

class InputController {
    moveMouse(deltaX, deltaY) {
        const mouse = robot.getMousePos();
        robot.moveMouse(mouse.x + deltaX, mouse.y + deltaY);
    }

    scrollMouse(x, y) {
        robot.scrollMouse(x, y);
    }

    clickMouse(button, double = false) {
        const validButtons = ['left', 'right', 'middle'];
        if (!validButtons.includes(button)) {
            throw new Error('Invalid button. Must be: left, right, or middle');
        }
        robot.mouseClick(button, double);
    }

    toggleMouse(button, state) {
        const validButtons = ['left', 'right', 'middle'];
        if (!validButtons.includes(button)) {
            throw new Error('Invalid button. Must be: left, right, or middle');
        }
        const validStates = ['down', 'up'];
        if (!validStates.includes(state)) {
            throw new Error('Invalid state. Must be: down or up');
        }
        robot.mouseToggle(state, button);
    }

    typeText(text) {
        robot.typeString(text);
    }

    pressKey(key) {
        robot.keyTap(key);
    }

    pressArrow(key) {
        const validKeys = ['up', 'down', 'left', 'right'];
        if (!validKeys.includes(key)) {
            throw new Error('Invalid key. Must be one of: up, down, left, right');
        }
        robot.keyTap(key);
    }
}

module.exports = InputController;
