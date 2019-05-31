//蓝牙模块 
//tips:操作完成后要及时关闭连接，同时也要关闭蓝牙设备，
//否则安卓下再次进入会搜索不到设备除非关闭小程序进程再进才可以，IOS不受影响
//异常情况，比如蓝牙中途关闭，网络断开，GPS未开启等等
let blueApi = {
  config: {
    deviceNo: "", //目标设备 上一次扫码设备
    device_info: "", //目标设备 扫码传送
    server_info: "6E40", //已知的主服务，如果每台设备固定，则可以直接配置方便过滤
    write_info: "0002", //写 特征值uuid
    read_info: "0003", //读 特征值uuid
    connectCmd: [0xAA, 0x7E, 0x54, 0x59, 0x5A, 0xAA],
    checkCmd: [0x55, 0xE7, 0x54, 0x59, 0xA5, 0x55],
    that: null //页面this指向
  },
  blue_data: {
    isFoundDevice:false,//是否搜索到目标设备，处理重复搜索
    device_id: "", //蓝牙deviceId
    service_id: "", //蓝牙特征值对应服务的 uuid
    write_id: "", //蓝牙特征值对应服务的write_id 
    read_id: "", //蓝牙特征值对应服务的read_id
    notify_id: "", //蓝牙特征值的 uuid
    package: null, //蓝牙接收到的数据包
    isConnect: false, //是否握手指令
    isAuthorization: false //设备是否授权
  },
  deviceDb: {
    //设备状态以及相关数据
    isOnline: false, //是否在线，握手成功=>获取设备在线状态
    isUsing: false, //是否正在使用
    isClose: false, //是否关机
    isPause: false, //是否暂停 预留
    surplusTime: 0, //剩余时间(单位s)
    usedTime: 0, //使用时间(单位s)
    totalTime: 0, //授权时间(单位s)
    mode: 3 //MODE：1-女性 2-通用 3-男性 
  },
  showToast(text) {
    wx.showToast({
      title: text,
      icon: 'none',
      duration: 2500
    })
  },
  openBluetoothAdapterError(errCode) {
    //错误码
    errCode = Number(errCode)
    let errMsg = "未初始化蓝牙适配器"
    switch (errCode) {
      case 10001:
        errMsg = "请检查手机蓝牙是否打开";
        break;
      case 10002:
        errMsg = "没有找到指定蓝牙设备";
        break;
      case 10003:
        errMsg = "蓝牙连接失败,请检查是否开启[蓝牙]和[位置定位]";
        break;
      case 10004:
        errMsg = "没有找到蓝牙设备指定服务";
        break;
      case 10005:
        errMsg = "没有找到蓝牙设备服务指定特征值";
        break;
      case 10007:
        errMsg = "当前蓝牙设备服务特征值不支持此操作";
        break;
      case 10008:
        errMsg = "当前蓝牙适配器不可用";
        break;
      case 10006:
        errMsg = "当前蓝牙连接已断开";
        break;
      case 10009:
        errMsg = "当前设备不支持蓝牙";
        break;
      default:
        break;
    }
    return errMsg
  },
  connect(deviceNo, obj, isConnect) {
    if (this.blue_data.device_id) {
      //断开与低功耗蓝牙设备的连接
      this.disconnect();
      //关闭蓝牙模块
      this.closeBluetoothAdapter()
      this.blue_data.isFoundDevice = false
      this.sleep(500)
    }
    if (obj) {
      this.config.that = obj
    }
    this.blue_data.isConnect = isConnect || false
    if (deviceNo && this.config.device_info !== deviceNo) {
      this.blue_data.isFoundDevice = false
      this.config.deviceNo = this.config.device_info;
      this.config.device_info = deviceNo;
      this.blue_data.device_id = "";
    }
    //console.log("设备号：" + this.config.device_info)
    if (!wx.openBluetoothAdapter) {
      this.showToast("当前微信版本过低，无法使用蓝牙功能，请升级到最新微信版本后重试。");
      return;
    }
    const _this = this;
    //初始化蓝牙模块
    wx.openBluetoothAdapter({
      complete: (res) => {
        if (res.errCode && res.errCode != 0) {
          _this.showToast(_this.openBluetoothAdapterError(res.errCode))
        } else {
          //监听蓝牙适配器状态变化事件
          // wx.onBluetoothAdapterStateChange((d) => {
          //   //available：蓝牙适配器是否可用
          //   if (d.available) {
          //     //兼容处理 IOS蓝牙状态变化以后不能马上开始搜索
          //     //否则可能会搜索不到设备，需等待2秒以上
          //     setTimeout(() => {
          //       _this.connect();
          //     }, 2000);
          //   }
          // })
          setTimeout(()=>{
            _this.getBlueState();
          },200)
        }
      }
    })
  },
  //指令
  directive: {
    //获取设备在线状态 
    getDeviceOnlineStatus: [0x7e, 0, 0, 0, 0, 0, 0, 0, 0, 0x5a],
    //开启设备授权  0x7e,t1,t2,t3,t4,0,1,0,3,0x5a 
    openAuthorization(seconds) {
      let instructions = [0x7e, 0, 0, 0, 0, 0, 1, 0, 3, 0x5a]
      //这里时间转换可能存在问题，需要测试一下
      let arr = seconds.toString(16).split('').map((t) => {
        return parseInt(t, 16)
      })
      let arrLen = arr.length
      instructions.splice(5 - arrLen, arrLen, ...arr)
      return instructions
    },
    //状态查询 
    getDeviceStatus: [0x7e, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x5a],
    /*
    设备控制部分
    type(6,7,8):
    6-模式选择=>params:1-女性 2-通用 3-男性;
    7-暂停/继续=>params:0-继续 1-暂停;
    8-关闭=>params:0-工作 1-停止
    */
    deviceControl(type = 6, params = 3) {
      let instructions = [0x7e, 0, 6, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x5a]
      instructions.splice(2, 3, ...[type, 0, params])
      return instructions
    }
  },
  //蓝牙返回数据处理
  dealWith(res) {
    const _this = this
    /*
     type:0-握手,1-设备在线状态[10]，2-开启设备授权[10] 3-状态查询[24]
     packageLen：10 or 24 数据包长度,
     package：数据包
    */
    if (res.type === 0) {
      //握手成功，查询设备状态
      //console.log("握手成功")
      _this.showToast("蓝牙连接成功")
      setTimeout(() => {
        //所有控制命令必须在授权时间大于 0 的情况才能有效响应，包括查询状态的！
        //查询设备状态 问题：蓝牙断开连接！所以这里的true应从扫码开始为true，使用一次改为false   
        _this.sendMsg(_this.directive.getDeviceStatus, true)
      }, 250)
    } else if (res.type === 1) {
      _this.deviceDb.isOnline = true
    } else if (res.type === 2) {
      //0x7e,t1,t2,t3,t4,0,1,0,1,0x5a
      //设备授权成功 可以发送指令
      //倒计时开始
      _this.config.that.countdownFunc()
      //选择模式
      setTimeout(() => {
        _this.sendMsg(_this.directive.deviceControl(6, _this.deviceDb.mode))
      }, 250)

    } else {
      //设备状态查询
      const arr = res.package
      if (_this.blue_data.isConnect) {
        _this.blue_data.isAuthorization = true
        _this.blue_data.isConnect = false
        //console.log("首次进入成功，查询设备状态")
        //首次查询判断
        if (arr[22] === 0) {
          //console.log("首次进入成功，查询设备状态222222")
          //正在使用    
          if (_this.config.deviceNo === _this.config.device_info) {
            //自己扫码，出现倒计时
            //剩余时间(单位s)
            let timeText = arr[3].toString(16) + arr[4].toString(16) + arr[5].toString(16) + arr[6].toString(16)
            _this.deviceDb.surplusTime = parseInt(timeText, 16)
            //console.log("剩余时间：" + _this.deviceDb.surplusTime)
            _this.config.that.setData({
              isUsing: _this.deviceDb.isUsing,
              seconds: _this.deviceDb.surplusTime
            })
            setTimeout(() => {
              _this.config.that.countdownFunc()
            }, 0)
          } else {
            //其他人扫码，提示框
            wx.showModal({
              title: '温馨提示',
              content: '是否强制结束当前运行中设备，以便开始新的按摩服务?',
              showCancel: true,
              confirmColor: "#6A97FE",
              confirmText: '确定',
              success(mres) {
                if (mres.confirm) {
                  _this.sendMsg(_this.directive.deviceControl(8, 1))
                }
              }
            })
          }
        } else {
          //选择套餐
          wx.navigateTo({
            url: '../massage-package/massage-package?deviceNo=' + _this.config.device_info + '&isBlue=true'
          })
        }
      } else {
        //是否正在使用：0-工作，1-停止
        _this.deviceDb.isUsing = arr[22] === 0 ? true : false
        //是否关机:0-关机，1-开机
        _this.deviceDb.isClose = arr[19] === 0 ? true : false
        //剩余时间(单位s)
        let timeText = arr[3].toString(16) + arr[4].toString(16) + arr[5].toString(16) + arr[6].toString(16)
        _this.deviceDb.surplusTime = parseInt(timeText, 16)
        _this.config.that.setData({
          isUsing: _this.deviceDb.isUsing,
          seconds: _this.deviceDb.surplusTime
        })
      }
    }
    //关闭loadding
    wx.hideLoading()
  },
  //发送消息
  writeBLEValue(buf, callback) {
    const _this = this;
    wx.writeBLECharacteristicValue({
      deviceId: _this.blue_data.device_id, //蓝牙设备 id
      serviceId: _this.blue_data.service_id, //蓝牙特征值对应服务的 uuid
      characteristicId: _this.blue_data.write_id, //蓝牙特征值的 uuid
      value: buf, //蓝牙设备特征值对应的二进制值
      success: (res) => {
        callback(res)
      },
      fail(res) {
        //_this.writeBLEValue(buf);
        callback(false)
        _this.showToast(_this.openBluetoothAdapterError(res.errCode))
      }
    })
  },
  sendMsg(msg, isCheckCmd) {
    //开启loadding
    wx.showLoading({
      title: '请稍候...'
    })
    //console.log("发送消息数据：")
    //console.log(msg)
    const _this = this;
    //小程序不会对写入数据包大小做限制，但系统与蓝牙设备会限制蓝牙4.0单次传输的数据大小，
    //超过最大字节数后会发生写入错误，建议每次写入不超过20字节。
    //分包发送的问题，偏移量的问题会不会影响数据完整，如果有影响，需要调整
    const arrayLen = msg.length;
    for (let i = 0; i < arrayLen; i += 20) {
      let arrBufLen = (arrayLen - i - 20) > 0 ? 20 : arrayLen - i;
      let arr = msg.slice(i, i + arrBufLen);
      let buf = _this.arraytoToArrayBuffer(arr);
      // let hex = arr.map((h) => {
      //   return (h.toString(16).length === 1) ? '0' + h.toString(16) : h.toString(16)
      // }).join("")
      // let buf = _this.hexStringToArrayBuffer(hex,i)
      setTimeout(() => {
        _this.writeBLEValue(buf, (res) => {
          if (res) {
            //console.log("数据发送成功：" + JSON.stringify(res))
            if (isCheckCmd && i === 0) {
              //未授权情况下，命令失效，蓝牙无响应 处理
              setTimeout(() => {
                if (!_this.blue_data.isAuthorization) {
                  wx.hideLoading()
                  //选择套餐
                  //console.log("选择套餐：设备未授权")
                  wx.navigateTo({
                    url: '../massage-package/massage-package?deviceNo=' + _this.config.device_info + '&isBlue=true'
                  })
                }
              }, 4000)
            }
          } else {
            wx.showModal({
              title: '温馨提示',
              content: '蓝牙数据发送失败，是否重新发送?',
              showCancel: true,
              confirmColor: "#6A97FE",
              confirmText: '确定',
              success(mres) {
                if (mres.confirm) {
                  _this.sendMsg(msg, isCheckCmd)
                }
              }
            })
            //console.log("数据发送失败，重新发送?")
            wx.hideLoading()
          }
        })
      }, i / 20 * 250)
    }

    //  let buf = _this.arraytoToArrayBuffer(msg);
    // _this.writeBLEValue(buf, (res) => {
    //   if (res) {
    //     console.log("数据发送成功：" + JSON.stringify(res))
    //   } else {
    //     console.log("数据发送失败，重新发送?")
    //   }
    // })
  },
  //监听消息
  onNotifyChange() {
    const _this = this;
    //监听低功耗蓝牙设备的特征值变化事件 
    //必须先启用 notifyBLECharacteristicValueChange接口
    // 才能接收到设备推送的 notification
    wx.onBLECharacteristicValueChange((res) => {
      //console.log("监听消息返回：");
      let msg = _this.arrayBufferToHexString(res.value);
      let typedArray = new Uint8Array(msg.match(/[\da-f]{2}/gi).map(function(h) {
        return parseInt(h, 16)
      }))
      //console.log(typedArray);
      _this.stickyPackage(typedArray, (res) => {
        if (res) {
          //type/packageLen/package
          //console.log("监听到消息msg：");
          //console.log(res.package);
          //处理结果
          _this.dealWith(res)
        } else {
          //console.log("监听到的消息不完整，等待处理...");
        }
      })
    })
  },
  disconnect() {
    const _this = this;
    //断开与低功耗蓝牙设备的连接
    wx.closeBLEConnection({
      deviceId: _this.blue_data.device_id,
      success(res) {}
    })
  },
  closeBluetoothAdapter() {
    //关闭蓝牙模块。调用该方法将断开所有已建立的连接并释放系统资源
    wx.closeBluetoothAdapter({
      success: (res) => {}
    })
  },
  /*事件通信模块*/

  /*连接设备模块*/
  getBlueState() {
    const _this = this;
    if (_this.blue_data.device_id != "" && wx.getSystemInfoSync().platform.toUpperCase() ==="ANDROID") {
      _this.connectDevice();
      return;
    }
    //获取本机蓝牙适配器状态
    wx.getBluetoothAdapterState({
      success: (res) => {
        if (!!res && res.available) { //蓝牙可用    
          _this.startSearch();
        }
      }
    })
  },
  startSearch() {
    const _this = this;
    //开始搜寻附近的蓝牙外围设备。此操作比较耗费系统资源，
    //请在搜索并连接到设备后调用 wx.stopBluetoothDevicesDiscovery 方法停止搜索
    wx.startBluetoothDevicesDiscovery({
      services: [],
      success(res) {
        //监听寻找到新设备的事件
        wx.onBluetoothDeviceFound((res) => {
          //console.log("搜索到蓝牙设备：" + JSON.stringify(res))
          //过滤目标设备
          if (_this.blue_data.isFoundDevice) {
            _this.stopSearch();
            return
          }else{
            _this.showToast("正在搜索蓝牙设备...")
          }
          let device = _this.filterDevice(res.devices);
          if (device && !_this.blue_data.isFoundDevice) {
            _this.blue_data.isFoundDevice=true
            _this.showToast("设备搜索成功，正在连接...")
            //console.log("目标设备锁定成功：" + JSON.stringify(device))
            _this.blue_data.device_id = device.deviceId;
            _this.stopSearch();
            _this.connectDevice();
          }
        });
        //搜索不到设备处理
        setTimeout(()=>{
          if (!_this.blue_data.isFoundDevice){
            _this.stopSearch();
            wx.showModal({
              title: '温馨提示',
              content: '无法搜索到蓝牙,请检查是否开启[位置定位]权限',
              showCancel: true,
              confirmColor: "#6A97FE",
              confirmText: '重新搜索',
              success(mres) {
                if (mres.confirm) {
                  _this.startSearch();
                }
              }
            })
          }
        },10000)
      },
      fail(res){
        _this.showToast(_this.openBluetoothAdapterError(res.errCode))
      }
    })
  },
  //连接到设备
  connectDevice() {
    const _this = this;
    //连接低功耗蓝牙设备
    wx.createBLEConnection({
      deviceId: _this.blue_data.device_id,
      success(res) {
        //console.log("连接低功耗蓝牙设备:" + JSON.stringify(res))
        _this.getDeviceService();
      },
      fail(res) {
        _this.showToast(_this.openBluetoothAdapterError(res.errCode))
      }
    })
  },
  //搜索设备服务
  getDeviceService() {
    const _this = this;
    //获取蓝牙设备所有服务(service)
    wx.getBLEDeviceServices({
      deviceId: _this.blue_data.device_id,
      success: (res) => {
        //过滤主服务
        //console.log("获取蓝牙设备所有服务:" + JSON.stringify(res))
        let service_id = _this.filterService(res.services);
        if (service_id != "") {
          _this.blue_data.service_id = service_id;
          _this.getDeviceCharacter();
        }
      },
      fail(res) {
        _this.showToast(_this.openBluetoothAdapterError(res.errCode))
      }
    })
  },
  //获取连接设备的所有特征值  
  getDeviceCharacter() {
    const _this = this;
    //获取蓝牙设备某个服务中所有特征值
    wx.getBLEDeviceCharacteristics({
      deviceId: _this.blue_data.device_id,
      serviceId: _this.blue_data.service_id,
      success: (res) => {
        //console.log("获取连接设备的所有特征值:" + JSON.stringify(res))
        let notify_id, write_id, read_id;
        for (let i = 0; i < res.characteristics.length; i++) {
          if (res.characteristics[i].uuid.indexOf(_this.config.write_info) != -1) {
            write_id = res.characteristics[i].uuid;
          }
          if (res.characteristics[i].properties.notify) {
            notify_id = res.characteristics[i].uuid;
          }
          //如果失败则是分开的操作，可能需要单独监听write和read
          if (res.characteristics[i].uuid.indexOf(_this.config.read_info) != -1) {
            read_id = res.characteristics[i].uuid;
          }
        }
        if (notify_id != null && write_id != null) {
          _this.blue_data.notify_id = notify_id;
          _this.blue_data.write_id = write_id;
          _this.blue_data.read_id = read_id;
          setTimeout(() => {
            _this.openNotify();
          }, 100);
        }
      },
      fail(res) {
        _this.showToast(_this.openBluetoothAdapterError(res.errCode))
      }
    })
  },
  openNotify() {
    const _this = this;
    //启用低功耗蓝牙设备特征值变化时的 notify 功能，订阅特征值
    wx.notifyBLECharacteristicValueChange({
      state: true, //是否启用 notify
      deviceId: _this.blue_data.device_id,
      serviceId: _this.blue_data.service_id,
      characteristicId: _this.blue_data.notify_id, //蓝牙特征值的 uuid
      complete: (res) => {
        //console.log("启用低功耗蓝牙设备特征值变化时的 notify 功能:" + JSON.stringify(res))
        if (res.errCode && res.errCode != 0) {
          //console.log("notify启用错误...")
          _this.showToast(_this.openBluetoothAdapterError(res.errCode))
          return
        }
        //兼容处理：开启notify以后并不能马上发送消息，蓝牙设备有个准备的过程，
        //需要在setTimeout中延迟1秒以上才能发送，否则会发送失败
        setTimeout(() => {
          //初始消息发送 握手包
          _this.sendMsg(_this.config.connectCmd);
        }, 1000);
        _this.onNotifyChange(); //接受消息
      }
    })
  },
  /*连接设备模块*/


  /*其他辅助模块*/
  //停止搜索周边设备  
  stopSearch() {
    const _this = this;
    wx.stopBluetoothDevicesDiscovery({
      success: (res) => {}
    })
  },
  //数据粘包处理 帧头[7e=>126] + 长度[10,24] + 数据 + 校验[参考文档格式进行校验] + 帧尾[5a=>90]
  /*返回 数据
   type:0-握手，1-设备在线状态[10]，2-开启设备授权[10] 3-状态查询[24]
   packageLen：10 or 24 数据包长度,
   package：数据包
   false：数据错误，或者断包，需要进一步处理
  */
  stickyPackage(arr, callback) {
    const _this = this
    const arrLen = arr.length
    if (arrLen === 0) {
      callback(false)
    } else if (arr[0] === 85 && arr[arrLen - 1] === 85 && arrLen > 1) {
      callback({
        type: 0,
        packageLen: arrLen,
        package: arr
      })
    } else if (arr[0] === 126 && arr[arrLen - 1] === 90 && (arrLen === 10 || arrLen === 24)) {
      let type = 3
      if (arrLen === 10) {
        type = (arr[arrLen - 2] === 1 && arr[arrLen - 4] === 1) ? 2 : 1
      }
      let data = {
        type: type,
        packageLen: arrLen,
        package: arr
      }
      callback(data)
    } else {
      let subpackage = _this.blue_data.package || new Uint8Array(0);
      if (subpackage.length === 0 && arr[0] !== 126) {
        callback(false)
        return
      }
      let tempPackage = new Uint8Array(subpackage.length + arrLen)
      if (subpackage.length > 0) {
        tempPackage.set(subpackage, 0)
      }
      tempPackage.set(arr, subpackage.length)
      _this.blue_data.package = tempPackage
      const packageLen = _this.blue_data.package.length
      if (_this.blue_data.package[0] === 126 && arr[arrLen - 1] === 90 && (packageLen === 10 || packageLen === 24)) {
        const stickyData = _this.blue_data.package
        let packageType = 3
        if (packageLen === 10) {
          packageType = (stickyData[packageLen - 2] === 1 && stickyData[packageLen - 4] === 1) ? 2 : 1
        }
        let packageData = {
          type: packageType,
          packageLen: packageLen,
          package: stickyData
        }
        _this.blue_data.package = null
        callback(packageData)
      } else {
        callback(false)
      }
    }
  },
  arraytoToArrayBuffer(array) {
    let typedArray = new Uint8Array(array.map((h) => {
      return parseInt(h.toString(16), 16)
    }))
    return typedArray.buffer
  },
  arrayBufferToHexString(buffer) {
    let bufferType = Object.prototype.toString.call(buffer)
    if (buffer != '[object ArrayBuffer]') {
      return
    }
    let dataView = new DataView(buffer)

    var hexStr = '';
    for (let i = 0; i < dataView.byteLength; i++) {
      let str = dataView.getUint8(i);
      let hex = (str & 0xff).toString(16);
      hex = (hex.length === 1) ? '0' + hex : hex;
      hexStr += hex;
    }
    return hexStr.toUpperCase();
  },
  hexStringToArrayBuffer(str, ind = 0) {
    if (!str) {
      return new ArrayBuffer(0);
    }
    let buffer = new ArrayBuffer(str.length / 2);
    let dataView = new DataView(buffer)
    for (let i = 0, len = str.length; i < len; i += 2) {
      let code = parseInt(str.substr(i, 2), 16)
      dataView.setUint8(ind, code)
      ind++
    }
    return buffer;
  },
  //过滤目标设备
  filterDevice(device) {
    //console.log("过滤目标设备:" + JSON.stringify(device))
    let obj = null
    for (let i = 0; i < device.length; i++) {
      if (device[i].name && device[i].name === this.config.device_info) {
        obj = {
          name: device[i].name,
          deviceId: device[i].deviceId
        }
        break;
      }
    }
    return obj
  },
  //过滤主服务
  filterService(services) {
    let service_id = "";
    //console.log("过滤主服务：" + JSON.stringify(services));
    for (let i = 0; i < services.length; i++) {
      if (~services[i].uuid.toUpperCase().indexOf(this.config.server_info)) {
        service_id = services[i].uuid;
        break;
      }
    }
    return service_id;
  },
  sleep(delay){
    let start = (new Date()).getTime();
    while ((new Date()).getTime() - start < delay) {
      continue;
    }
  }
}

module.exports = {
  blueApi: blueApi
}