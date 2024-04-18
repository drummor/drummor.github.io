---
title: 从字符、字符集、字符编码一路到URLEncode
date: 2024-01-26 11:18:49
tags: basic
---


## 前言

平时写代码过程中经常会跟 unicode ，utf-8，字符集，字符编码，百分号编码，char数据格式等这些概念打交道。要想对其灵活运用，出了问题能够有思路快速定位出问题所在，理解这些概念以及原理是必不可少的。

## 1. 字符集(Character set)

字符类似 a,b，你，& 等各种文字和符号的总称，包括各国家文字、标点符号、图形符号、数字，emoji等是一个字符。而**字符的集合就称之为字符集**。我们常见字符集有 ASCCII 字符集、Unicode 字符集、GBK 字符集等。

**ASCCII字符集**  主要包括控制字符（回车键、退格、换行键等）；可显示字符（英文大小写字符、阿拉伯 数字和西文符号）。

**Unicode字符集** ASCCII具有很大的局限性，只能表示至多127个字符，而诸如汉字，阿拉伯语等都有自己的文字字符，ASCCII字符集是不能表示的。Unicode字符集可以简单的理解为通用所有字符的一个集合。

每个字符对应一个数字，每个数字对应一个字符，而这个数字也称之为**码点**。根据码点就可以字符集中索引到对应的字符。

## 2. 字符编码

计算机系统中所有的数据都是用二进制进行传输和存储的，当然字符也不例外。把一个数值与字符集中的字符进行匹配建立一一对应关系的规则称之为字符编码。跟我们差字典一样，同一本字典(编码)第几页第几个字(字符)就能确定唯一一个字符。通常来讲，每一个字符在字符集中都有一个码点，我们对根据码点就能确认一个字符，我们对码点就行储存和编码就能达到对字符进行传输和存储的目的。

### 2.1.  **UTF-8**

> UTF-8（8-bit Unicode Transformation Format）是一种针对Unicode的可变长度字符编码，也是一种前缀码。它可以用来表示Unicode标准中的任何字符，且其编码中的第一个字节仍与ASCII兼容。

UTF-8是一种变长的字符编码，一个字符的UTF-8编码可能占1-4个字节，而占某个字符具体占几个字节取决，字符码点的值。

具体表示的时候，

- 如果第一个字节的第一bit为0，表示当前字符只用一个字节就可以表示。具体的码点值，就是当前字节除0位之外其他7个字节。
- 如果第一个字节的第一个bit不为0，则从开头知道碰到第一个0的过程中有几个1，就用几个字节表示。好像描述的不太好，看图更明了。如下图

```
Unicode符号范围(码点范围)     |       UTF-8编码模板
(十六进制)                   |       （二进制）
---------------------------+---------------------------------------------
0000 0000-0000 007F        | 0xxxxxxx                             |可用7bit
0000 0080-0000 07FF        | 110xxxxx 10xxxxxx					  |可用11bit
0000 0800-0000 FFFF        | 1110xxxx 10xxxxxx 10xxxxxx           |可用16bit
0001 0000-0010 FFFF        | 11110xxx 10xxxxxx 10xxxxxx 10xxxxxx  |可用21bit
```

上表表示如何从一个从Unicode 转化到UTF-8 。

对于任意字符，UInicode码点的值，在上表中找到对应的编码模板，然后把码点值转换为2进制，依次从后往前填入码位(上表中的x)，不足的用0补齐。

![](/images/url_encode_1706239052087.png)

比如 :[**你**] 这个字的 Unicode 编码是0x4f60。0x6C49在0x0800-0xFFFF之间，使用3字节模板：1110xxxx 10xxxxxx 10xxxxxx。将ox4f60 写成二进制是： 1001111 01100000 ， **从这个二进制值从低到高取出比特，从模板的低位到高位替换模板中的x的位置**，不足的用0补齐，得到：11100100  10111101  10100000。可见[你]这个字符utf-8编码占3个字节。

### 2.2.  UTF-16

UTF-16也是一种变长的字符编码，一个字符的UTF-16编码可能2或者4个字节。 Unicode字符集中的字符码点值在65535范围内可以用UTF-16一个**码元**（Code Unit）表示，超过65535需要用两个码元进行表示。

**java中内码采用的是UTF-16的编码**方式且java中一个char占两个字节，严格意义上讲，**char和字符不能划等号**。有时候两个char才能表示为一个字符，java中的char数据类型是应该被看做为采用UTF-16编码表示的Unicode码点的码元(code unit)。最常用的Unicode字符使用一个代码单元就可以表示，而辅助字符则需要一对码元（code Unit）表示。

码点值为 0xD800 到 0xDFFF 的码点不对应任何字符。因此，这个空段可以用来映射码点值大于0xffff的其他字符。UTF-16就是基于这一点对码点值超过 0xffff 的字符进行编码的。

```javascript
0xDB800         0xDBFF  0xDC00            0xDFFFF
   \______________/        \________________/ 
           |                         |         
   high surrogatepath         low surrogate   
        (高位代理区)             （低位代理区）
      
```



- 当码点值小于 0x10000 也就是小于等于 0xffff时，可以用一个 uft-16 的码元(code unit)也就是两个字节直接表示；

- 当字符的码点值大于0xffff时，需要由两个码元四个字节表示直接表示,码点值减 0x10000 把得到一个20bit的结果值(高位不足用0补齐)，然后前10bit加0x800作为第一个码元，后10bit加0xDC00作为第二个码元。

  下图以字符    **𐐷**    为例看具体转换过程。



![](/images/url_encode_1706239052174.png)


## 3. URL

### 3.1. URL格式

统一资源定位符的完整格式如下：

 ```javascript
         foo://example.com:8042/over/there?name=ferret#nose
         \_/   \______________/\_________/ \_________/ \__/
          |           |            |            |        |
       scheme     authority       path        query   fragment
          |   _____________________|__
         / \ /                        \
         urn:example:animal:ferret:nose
 ```

一个完整的URL主要有以下部分组成这些部分被URL的保留字符相连。

- 协议（sheme）。
- 层级URL标记符号，为[//],是固定不变的
- 访问资源需要的凭证信息(authority）
- 服务器地址(host)。通常为域名，有时为IP地址
- 端口号(port)。以数字方式表示，若为默认值可省略
- 路径(path)。以“/”字符区别路径中的每一个路径名称
- 查询(query)。键值对参数，以“?”字符为起点，每个参数键值对以“&”隔开，再以“=”分开参数名称和值
- 片段。以“#”字符为起点

### 3.2. URL中的字符

- RFC中规定，URL中只有可显的asscii字符集中的字符是合法的。

- URL的字符中有特殊的含义通常用来做分隔符如http://www.google.com?a=12&b=34 中`:/?&`都为url中的**保留字符**。

  **2005年规定的保留字符:**

```java
  !  *   '   (   ) ; :  @  &  =  +  $  ,   ?  #  [  ]
```

- URL字符中,大写字母（A-Z)、小写字母(a-z)、数字(0-9)等为**非保留字符**。这些字符含义只是表示字面量在协议中不允许特殊的语义。

  **2005年规定的非保留字符:**

 ```javascript
A B C D E F G H I J K L M N O P Q R S T U V W X Y Z a b c d e f g h i j k l m n o p q r s t u v w x y z 0 1 2 3 4 5 6 7 8 9 - _ . ~
 ```

- URL字符中除了保留字符和非保留字符之外的字符，比如百分号符(%),这些**其他字符**，允许有一些特殊的语义但是不强制。

## 4. URL encoding 百分号编码

### 4.1. 为什么要URL encoding

- 在具体的URL中诸如path或者query部分，如果存在着保留字段会有语义上的不合法性。
  比如：`http://www.abac.com/a/?abc=1&2&ef=24`。&为保留字符，用以链接两个query键值对。而在这个URL中想要传递键为abc 值为1&2的时候在语法上是不合法的。

- URL的字符集只是ASCII字符集的一个字集，如果要传递URL合法的字符以外的字符，是没办法表示的。比如要在url的path中有"好"这个字符。

- 另，URL字符集中的其他字符集有可能存在不安全的字符。是有一些特殊语义的。

基于以上三点,我们需要一种编码来解决URl使用过程中的一些歧义。来解决这个编码问题的就是URLEncode。

### 4.2. URL encoding 的规则

> 2005年1月发布的RFC 3986

对可能会引起歧义的保留字符、不在ASCII码之外的字符和URL字符集范围内的其他字符进行URlEncode，以保证URL语义的正确性。URLEncode的规则：

- 未保留字符不需要百分号编码。比如字符a 百分号编码后之后还是a。

- 对保留字符的百分号编码。编码逻辑为：对应字符的ASCII的值表示为两个16进制的值，然后在其前面放置%字符。比如，保留字符？对应的ASCII码点值为6（十进制）对应16进制为3F，然后在16进制值前面加上%字符最终得到保留字符?的url编码为%3F。注意:对字节百分号编码后里16进制的表示都为大写字母比如%3F,且在URL编码后默认不区分大小写。

- 对于其他字符百分号编码。编码逻辑为:把对应字符用某种**编码格式(**如utf-8)转为字节序列，然后把每个字节序列的值进行百分号编码。这里展开说一下，所谓的对每个字节进行编码，把每个字节的值转为16进制，然后再16进制前加百分号就得到了对应的百分号编码。

**另：关于空格的URLencoding**

关于空格百分号编码为+ 还是%20的争论请移步于此:https://stackoverflow.com/questions/2678551/when-to-encode-space-to-plus-or-20


### 4.3. URL encoding 用途

- http post形式发送时指定Content-Type为 `application/x-www-form-urlencode`时，postbody中的键值对都会进行百分号编码以保证数据的无歧义。

- 当我们的http url中，query和path部分的内容如果需要被urlencode也要进行百分号编码，不做赘述。

### 4.4 Java中URLEncoder 赏析

当我们掌握了Unicode字符集，UTF-16,UTF-8,百分号编码等相关知识后再看JDK里URLEncoder这个类的encode()方法就和清晰明了了，下面这段代码就是JDK中URLEncoder encode()方法，我在个人认为比较重要的地方加了注释供参考，通过这个方法我们能更好巩固熟悉字符编码百分号编码以及相关知识。

在此之前还要重申一下，java中内存中char和字符串的字符编码采用的是utf-16,一个字符可能由一到两个char来表示，具体什么时候采用参考文中关于utf-16章节。

```java
public static String encode(String s, String enc)
    throws UnsupportedEncodingException {

    boolean needToChange = false;
    StringBuffer out = new StringBuffer(s.length());
    Charset charset;
    CharArrayWriter charArrayWriter = new CharArrayWriter();

    if (enc == null)
        throw new NullPointerException("charsetName");

    try {
        charset = Charset.forName(enc);
    } catch (IllegalCharsetNameException e) {
        throw new UnsupportedEncodingException(enc);
    } catch (UnsupportedCharsetException e) {
        throw new UnsupportedEncodingException(enc);
    }

    for (int i = 0; i < s.length();) {
        int c = (int) s.charAt(i); //取出字符串中的每一个char，也就是每一个字符
        if (dontNeedEncoding.get(c)) {//判断是否为非保留字符，根据规则如果是URL非保留字符百分号编码之后还是其本身，
            if (c == ' ') {
                c = '+';
                needToChange = true;
            }
            //System.out.println("Storing: " + c);
            out.append((char)c);
            i++;
        } else {
            //其他非保留字符进行百分号编码
            do {
                charArrayWriter.write(c);
                
                if (c >= 0xD800 && c <= 0xDBFF) {
                    // unicode字符集码点的代理区，这种情况下，需要连续的两个Code Unit来表示一个字符。
                    if ( (i+1) < s.length()) {//取出下一个char
                        int d = (int) s.charAt(i+1);
                        if (d >= 0xDC00 && d <= 0xDFFF) {//第二个待领取
                            charArrayWriter.write(d);
                            i++;
                        }
                    }
                }
                i++;
            } while (i < s.length() && !dontNeedEncoding.get((c = (int) s.charAt(i))));
            charArrayWriter.flush();
            String str = new String(charArrayWriter.toCharArray());//字符数组转字符串
            byte[] ba = str.getBytes(charset);//把字符串转为某种编码格式(如UTF-8)的字节数组
            for (int j = 0; j < ba.length; j++) {//把每个字节转换为16进制
                out.append('%');
                char ch = Character.forDigit((ba[j] >> 4) & 0xF, 16);//高4位转成对应的16进制
                if (Character.isLetter(ch)) {
                    ch -= caseDiff;
                }
                out.append(ch);
                ch = Character.forDigit(ba[j] & 0xF, 16);//低4位
                if (Character.isLetter(ch)) {
                    ch -= caseDiff;
                }
                out.append(ch);
            }
            charArrayWriter.reset();
            needToChange = true;
        }
    }
    return (needToChange? out.toString() : s);
}
```



## 小结

对文中提到的这些概念做一个人理解的小结

- 字符可以简单的理解为一个符号。比如a,b,1,3你,好。
- ASCCII、Unicode字符集等都是字符集，字符集是这些字符的集合。
- utf-8,utf-16都是字符编码。字符编码把字符集中的字符和某一对象建立映射关系。
- java内码采用的是utf-16字符编码，**char和字符不能划等号**。
- 百分号编码是为避免 URL中表述歧义而引入的一种编码方式。

**参考**

https://tools.ietf.org/html/rfc3986
