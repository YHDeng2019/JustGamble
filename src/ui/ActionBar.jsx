import React, { useState, useEffect } from 'react';

const ActionBar = ({ actions, onAction, disabled }) => {
  const raiseAction = actions.find(a => a.action === 'raise');
  const [raiseAmount, setRaiseAmount] = useState(raiseAction?.min || 0);
  const [inputText, setInputText] = useState(String(raiseAction?.min || 0));

  useEffect(() => {
    if (raiseAction) {
      setRaiseAmount(raiseAction.min);
      setInputText(String(raiseAction.min));
    }
  }, [raiseAction?.min]);

  const handleSliderChange = (e) => {
    const val = parseInt(e.target.value);
    setRaiseAmount(val);
    setInputText(String(val));
  };

  const handleInputChange = (e) => {
    // 允许自由编辑，不做 clamp
    setInputText(e.target.value);
  };

  const handleInputBlur = () => {
    // blur 时 clamp 到合法范围
    const val = parseInt(inputText);
    if (isNaN(val) || !raiseAction) {
      setInputText(String(raiseAmount));
      return;
    }
    const clamped = Math.min(Math.max(val, raiseAction.min), raiseAction.max);
    setRaiseAmount(clamped);
    setInputText(String(clamped));
  };

  const handleInputKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleInputBlur();
    }
  };

  const handleRaise = () => {
    // 提交时确保值合法
    const val = parseInt(inputText);
    const finalAmount = isNaN(val) ? raiseAmount :
      Math.min(Math.max(val, raiseAction?.min || 0), raiseAction?.max || val);
    onAction('raise', finalAmount);
  };

  return (
    <div className="action-bar">
      <div className="btn-group">
        {actions.map(action => {
          if (action.action === 'raise') {
            // 判断是跟注还是加注：如果 min === max，说明只能跟注
            const isCallOnly = action.min === action.max;
            const buttonText = isCallOnly ? '跟注' : '加注';

            return (
              <div key="raise" className="raise-controls">
                <input
                  type="range"
                  className="raise-slider"
                  min={action.min}
                  max={action.max}
                  value={raiseAmount}
                  onChange={handleSliderChange}
                  disabled={disabled}
                />
                <input
                  type="text"
                  inputMode="numeric"
                  className="raise-number-input"
                  value={inputText}
                  onChange={handleInputChange}
                  onBlur={handleInputBlur}
                  onKeyDown={handleInputKeyDown}
                  disabled={disabled}
                />
                <button
                  className="btn btn-primary action-btn"
                  onClick={handleRaise}
                  disabled={disabled}
                >
                  {buttonText}
                </button>
              </div>
            );
          }

          const btnClass = action.action === 'fold'
            ? 'btn btn-danger action-btn'
            : 'btn btn-primary action-btn';

          return (
            <button
              key={action.action}
              className={btnClass}
              onClick={() => onAction(action.action, action.amount || 0)}
              disabled={disabled}
            >
              {action.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default ActionBar;
