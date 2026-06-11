import React, { useState, useEffect } from 'react';

const ActionBar = ({ actions, onAction, disabled, pot }) => {
  const raiseAction = actions.find(a => a.action === 'raise');
  const [raiseAmount, setRaiseAmount] = useState(raiseAction?.min || 0);
  const [inputText, setInputText] = useState(String(raiseAction?.min || 0));
  const [showRaisePanel, setShowRaisePanel] = useState(false);

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
    setInputText(e.target.value);
  };

  const handleInputBlur = () => {
    const val = parseInt(inputText);
    if (isNaN(val) || !raiseAction) {
      setInputText(String(raiseAmount));
      return;
    }
    const clamped = Math.max(raiseAction.min, Math.min(raiseAction.max, val));
    setRaiseAmount(clamped);
    setInputText(String(clamped));
  };

  const handleInputKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleInputBlur();
      handleRaise();
    }
  };

  const handleRaise = () => {
    if (raiseAction && raiseAmount >= raiseAction.min && raiseAmount <= raiseAction.max) {
      onAction('raise', raiseAmount);
      setShowRaisePanel(false);
    }
  };

  const handleQuickRaise = (amount) => {
    if (!raiseAction) return;
    const clamped = Math.max(raiseAction.min, Math.min(raiseAction.max, amount));
    setRaiseAmount(clamped);
    setInputText(String(clamped));
  };

  const handleOpenRaise = () => {
    setShowRaisePanel(true);
  };

  const handleCancelRaise = () => {
    setShowRaisePanel(false);
    if (raiseAction) {
      setRaiseAmount(raiseAction.min);
      setInputText(String(raiseAction.min));
    }
  };

  // 主要操作按钮（非 raise）
  const mainActions = actions.filter(a => a.action !== 'raise');

  return (
    <div className="action-bar-wrapper">
      {/* 决策按钮区域 */}
      <div className="action-bar">
        {!showRaisePanel ? (
          <>
            {/* 回合指示小圆点 */}
            <span className="turn-dot" title="你的回合">●</span>
            {/* 主要操作按钮 */}
            {mainActions.map(action => {
              let btnClass = 'btn action-btn';
              if (action.action === 'fold') btnClass += ' btn-danger';
              else if (action.action === 'check') btnClass += ' btn-success';
              else btnClass += ' btn-primary';

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

            {/* Raise/Bet 按钮 */}
            {raiseAction && (
              <button
                className="btn btn-gold action-btn"
                onClick={handleOpenRaise}
                disabled={disabled}
              >
                {raiseAction.label}
              </button>
            )}
          </>
        ) : (
          /* 展开的加注面板 */
          <div className="raise-panel-inline">
            <div className="raise-panel-top">
              <span className="raise-label-inline">{raiseAction.label}</span>
              <button
                className="btn-close-inline"
                onClick={handleCancelRaise}
                disabled={disabled}
              >
                ✕
              </button>
            </div>

            <div className="raise-panel-controls">
              {/* 金额输入 */}
              <input
                type="number"
                className="raise-input-inline"
                value={inputText}
                min={raiseAction.min}
                max={raiseAction.max}
                onChange={handleInputChange}
                onBlur={handleInputBlur}
                onKeyDown={handleInputKeyDown}
                disabled={disabled}
              />

              {/* 滑块 */}
              <input
                type="range"
                className="raise-slider-inline"
                min={raiseAction.min}
                max={raiseAction.max}
                step={raiseAction.min}
                value={raiseAmount}
                onChange={handleSliderChange}
                disabled={disabled}
              />

              {/* 快捷按钮 */}
              <div className="raise-quick-btns-inline">
                <button
                  className="btn btn-small quick-btn-inline"
                  onClick={() => handleQuickRaise(raiseAction.min)}
                  disabled={disabled}
                >
                  最小
                </button>
                {pot > 0 && (
                  <>
                    <button
                      className="btn btn-small quick-btn-inline"
                      onClick={() => handleQuickRaise(raiseAction.min + Math.floor(pot * 0.5))}
                      disabled={disabled}
                    >
                      1/2池
                    </button>
                    <button
                      className="btn btn-small quick-btn-inline"
                      onClick={() => handleQuickRaise(raiseAction.min + pot)}
                      disabled={disabled}
                    >
                      全池
                    </button>
                  </>
                )}
                <button
                  className="btn btn-small btn-danger quick-btn-inline"
                  onClick={() => handleQuickRaise(raiseAction.max)}
                  disabled={disabled}
                >
                  All-in
                </button>
              </div>

              {/* 确认按钮 */}
              <button
                className="btn btn-gold raise-confirm-btn-inline"
                onClick={handleRaise}
                disabled={disabled}
              >
                确认
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ActionBar;
