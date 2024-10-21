---
title: 细嗅蔷薇，Gradle Task 必知必会

date: 2024-10-23 22:18:36

tags: Gradle

category: 基建
---

## 1 前言

![](/images/gradle-task-summary.png)

本文是之前文章（ [视角拉高，系统性地梳理下 Gradle](https://drummor.github.io/2024/01/26/%E8%A7%86%E8%A7%92%E6%8B%89%E9%AB%98%EF%BC%8C%E7%B3%BB%E7%BB%9F%E6%80%A7%E5%9C%B0%E6%A2%B3%E7%90%86%E4%B8%8BGradle/) ）的一个填坑，本文将详细的介绍拆解如何自定义 task 以及围绕 Gradle Task 的一些核心重要概念，相信通过这篇文，大家能够对 Gradle Task 有一个更新的理解。

Gralde Task 是构建里的一个独立的运行单元。诸如编译 classes、创建 jar 包等等。

Task 按照其类型(Type)来分类的话分两种类型内置 Task 和自定义实现 Task 类。内置 Task 是 Gradle 本身内置了一些实用的 Task，比如 Copy、Jar、Zip、Delete 等等。自定义 Task 类，开发者一般情况下会继承 DefaultTask 实现自己的 task 类型。

接下来，对任务的开发做详细的介绍，本文涉及的代码示例都已经上传到了 github。

- 结合代代码阅读效果更佳 [](https://github.com/drummor/gradle-tutorial)。为了比较纯粹的学习，该工程里删除了复杂的文件结构，把代码示例放在了 app/build.gradle.kts 下。
- 所有的示例使用的 kotlin，有代码提示，同时对于 Android 开发来说 0 上手成本。
- 提一个貌似 gradle/IDE 的 bug，我试图把 build.gradle.kts 拆开，然后通过 apply from 的方式引用，但是 kts 下是失效的。且该问题现在还没有解决。（https://stackoverflow.com/questions/64543462/build-gradle-script-with-modules-on-kotlin）

## 2 任务的配置

创建 Task 的方式有两种方式，一种是继承 DefaultTask 类，实现 Task。另一种动态的注册设置。

开发编写一个任务分两部，注册和配置。先看看如何在不定义一个 Task 类的情况下动态的实现注册一个 Gradle Task，先以计算机领域里的一个那句名言 hello world 开始。如下代码

```Kotlin
tasks.register("hello") {
    group = "task basic sample"
    description = "this is the first lovely task."
    doLast {
        println("hello world ~")
    }
}
```

(示例 1)

命令行中执行如下命令，就能看到 hello world ～ 的输出了。

```
$ ./gradlew build
```

### 2.1 基本信息

![Alt text](/images/gradle-task-actions.png)

一个任务有一些基本的信息，name、group 、descrption。设置这些信息可以很好的帮助用户管理、理解以及如何使用这些任务。

查看项目中有哪些任务可以通过

$ ./gradlew tasks

还是使用上面 hello 任务代码 (示例 1)，我们通过 tasks 命令可以看到如下信息。

> Task basic sample tasks
>
> ---
>
> hello - this is the first lovely task.

对应的，如果使用 AndroidStudio 或 IntelliJ IDE ，可以在其侧边栏看到

这里有个小 tips，你可以尝试下，当 task 未设置 group 时，通过 `$ ./gradlew tasks` 命令是查看不到该 task 的。如果要显示未设置了 group 的 task 可以通过`gradle tasks --all` 。猜测，这种 Gradle 这种设计也是在提倡大家规范的创建 task。另外，未设置 group 的 task，在 IDE 中可以看到会归为 other。

### 2.2 任务动作

一个人任务包含若干个动作(action)，我们可以通过 doFirst{} 和 doLast {} 闭包，前插和追加任务。

```Kotlin
//2.创建包含多个动作的任务
tasks.register("multipleTask") {
    group = "task basic sample"
    description = "the task has two actions."

    doLast {
        println("second,show the task description.the task description  is \" $description \"")
    }

    doFirst {
        println("first,show the task name.the task name is $name")
    }
}
```

（示例 2）

## 3 任务依赖与任务排序

在 [视角拉高，系统性地梳理下 Gradle](https://juejin.cn/post/7204389419700518967) 文里介绍过，任务的执行往往是放在一个任务的有向无环图中，以此的执行。

Gradle 根据任务的依赖关系让多个任务按照既定的顺序执行。这种机制让任务的执行能确保其所依赖的任务已经执行完成之后。

依赖关系大概分为两类，隐形的依赖和显性的依赖。隐形依赖，是 Gradle 自动推断出的依赖关系，比如某个 A 任务的输入依赖于 B 任务的输出，Gradle 会自动的在把 A 任务依赖于 B 任务。显性依赖，是我们使用一系列的诸如 `dependsOn`方式明确的把任务之间的依赖关系做声明。隐形依赖在下一个章节的输入输出再做展开，该章节介绍下显性依赖。

### 3.1 任务依赖

显示地设置任务依赖最直接最方面的方式就是使用 Task 的 dependsOn 方法，dependsOn 的参数是一个可变参数意味着可以同时设置多个任务，也就是某个任务的依赖不单单只能设置一个依赖，还可以设置多个。同时参数的类型也是很灵活，可以是任务的名称，任务路径，任务对象，任务集合等等具体可参考 https://docs.gradle.org/current/javadoc/org/gradle/api/Task.html#dependencies。

如下示例，使用的是任务名称。

```Kotlin
tasks.register("taskA") {
    group = "taskDependencies"
    doLast {
        println("taskA")
    }
}

tasks.register("taskB") {
    group = "taskDependencies"
    doLast {
        println("taskB")
    }
    dependsOn("taskA")
}
```

（示例 3）

> \> Task :app:taskA
>
> taskA
>
> \> Task :app:taskB
>
> taskB

执行 `$ gradel taskA`, 会看到先执行了 taskA 任务，再执行了 TaskB 任务。

### 3.2 任务排序

在某些情况下，只是想控制任务执行顺序，但不会影响任务的执行。比如在上章节的这个例子，因为设置了 taskB 依赖 taskA 在执行 taskB 时，会执行其依赖的任务 taskA。任务排序常用的 Task 的 mustRunAfter 。

```Kotlin
val taskX by tasks.register("taskX") {
    group = "taskOrdering"
    doLast {
        println("taskX")
    }
}
val taskY by tasks.register("taskY") {
    group = "taskOrdering"
    doLast {
        println("taskY")
    }
    mustRunAfter("taskX")
}
```

（示例 4）

- 运行 `$ gradle -q taskY taskX` 会看到会先执行 taskX 再执行 taskY。
- 如果执行 `$ gradle -q taskY` 会看到执行了 taskY；如果运行 `$ gradle -q taskX 会看到执行了 taskX。可见任务的排序只是影响任务的执行顺序，但是不会直接影响影响任务的执行。

还可以使用 Task 的 shouldRunAfter 方法设置对任务的执行进行排序，与 mustRunAfter 相比 shouldRunAfter 不会是强约束。shouldRunAfter 会在两种以下两种情况下失效

- 如果使用了该规则会导致“依赖环”。比如 taskX 依赖 taskY，taskY 依赖 taskZ，此时设置如果 taskZ should run after taskX。该规则将失效。
- 当使用任务并发执行特性且除了“should run afte”外，其他依赖项都满了，会忽略 “should run afte ”规则。

shouldRunAfter 的例子就不展开了，可自行实验。

这里做个小结，通过 mustRunAfter 和 shouldRunAfter 设置的任务排序，都会影响任务的依赖。设置了任务排序的任务是可以独立执行，排序规则只会在任务同时被安排了执行时生效。

### 3.3 尾随任务

尾随任务(Finalizer tasks) 会在任务执行完成后执行，这种设置对于需要做清理动作或者统计行为时很有效。

```Kotlin
tasks.register("finalizerTask1") {
    group = "finalizer task"
    doLast {
        println(this.name + " is executed")
    }
}

tasks.register("finalizerTask2") {
    group = "finalizer task"
    doLast {
        println(this.name + " is executed")
    }
}

tasks.named("taskA") {
    finalizedBy("finalizerTask1")
}

tasks.named("taskB") {
    finalizedBy("finalizerTask2")
}
```

（示例 5）

taskA 和 taskB 的代码没有贴出，同时 taskB 依赖 taskB。执行 `$ gradle -q  taskA` 时，会看到以此执行 taskA、finalizerTask1、taskB、finalizerTask2。

设置了尾随任务的执行，无论执行成功或者失败，只要任务执行完成，尾随任务都会执行。

## 4 输入输出

![Alt text](/images/gradle-task-input-output.png)

### 4.1 分类

Gradle 的 Task 以是否有 Action 分类，可分为两类，实体任务和生命周期任务。声明周期任务的特点是没有 Action 实体，而是通过 dependeceOn 的方法来组织任务的顺序执行，比如在构建 Andorid Apk 的 build 任务，就是一个典型的声明周期任务，他负责组织诸如编译 classes 任务，打包 resource 任务。实体任务的特点是有真实的 Action 实体，比如打包 zip 的 ZIP 类型任务。

前文我们给一个给任务添加行为实体的时候是通过 doLast 和 doFirst。该章节我们使用创建一个继承 DefaultTask 类的方式自定义实体任务。自定义任务的时候会除了定义运行实体，还有两类重要的属性：输入和输出。

任务的输入和输出可以是文件、目录或者其他变量。

自定义一个 Task 的最佳实践，是封装好执行逻辑的同时，明确的声明好输入/输出。这样的好处也很多

- 增量编译，避免重复执行相同的逻辑。
- 连接输入输出，当任务的输出作为另外一个任务的输入时，能够自动的创建任务的依赖。
- 任务配置，任务的输出可以作为 gradle 的配置项。

```Kotlin
abstract class RevertTextTask: DefaultTask() {
    init {
        group = "input and out sample"
    }
    @InputFile
    lateinit var inputTextFile: File

    @OutputFile
    lateinit var outputTextFile: File

    @TaskAction
    fun revert() {
        val text = inputTextFile.readText()
        val reversedText = text.reversed()
        outputTextFile.writeText(reversedText)
    }
}

tasks.register<RevertTextTask>("revertTextTask") {
    inputTextFile = layout.projectDirectory.file("input.txt").asFile
    outputTextFile = layout.buildDirectory.file("out.txt").get().asFile
}
```

（示例 6）

这里特别说明一下，自定义 Task Class 定义为抽象类，属性也会定义为抽象的。Gradle 内部会自动管理这些抽象属性的实现。具体来说，Gradle 提供了“managed properties”的概念，允许您将每个属性声明为抽象 getter（Java、Groovy）或抽象属性（Kotlin）。然后，Gradle 会自动提供这些属性的实现。这种机制被称为“托管属性”（managed properties）。

当然，也可以自己来精确的自己来管理这些属性。

属性的默认值

### 4.2 惰性输入/输出

Gradle 的任务惰性输出输出能够让我们在其值未真正的设置之前能够引用到他。惰性输入输出使用 Property 类型。

这种机制的优势之一是能够在另一个任务输出文件名未确认之前就能链接到。Property 类也能推断出链接到哪个输出，所以通过这种方式有使 Gradle 能够自动的构建任务依赖。

**注意：**

- 惰性输入可以是普通类型、File 或者 Directory，比如，Property<String>、Property<Long>、RegularFileProperty、DirectoryProperty。
- 惰性输出类型只能是 File 或者 Dir，比如 RegularFileProperty、DirectoryProperty。思考下为什么？

`RegularFile` 是 Gradle 中用于表示和操作文件的一种高级类型，提供了延迟配置和依赖注入等功能，而普通的 `File` 是 Java 中用于文件操作的基本类。在 Gradle 构建脚本中，`RegularFile` 更适合用于复杂的文件操作和配置。类似的`Directory`则表示一个目录，即文件系统中的一个文件夹。他们对应的惰性类型分别为：RegularFileProperty 和 DirectoryProperty。

看如下示例。

```Kotlin
/**
 * 7. task's 惰性、隐式依赖
 */
abstract class GenerateGreetingTask : DefaultTask() {
    @get:Input
    abstract val greetingText: Property<String>

    @get:OutputFile
    abstract val greetingFile: RegularFileProperty

    init {
        group = "input and out sample"
    }

    @TaskAction
    fun execute() {

        if (greetingFile.get().asFile.exists().not()) {
            greetingFile.get().asFile.createNewFile()
        }
        greetingFile.get().asFile.writeText(greetingText.get())
        println("write greeting text success !")
    }
}

val greetingTask = tasks.register<GenerateGreetingTask>("generateGreetingTask") {
    val dateFormat = SimpleDateFormat("yyyy-MM-dd hh:mm:ss ")
    val time = dateFormat.format(Date())
    val text = """
            say hello , when $time from China !
        """.trimIndent()
    greetingText.set(text)

    this.greetingFile.set(layout.projectDirectory.file("greeting.txt"))
}

abstract class ReplyTask : DefaultTask() {
    init {
        group = "input and out sample"
    }
    @get:InputFile
    abstract val greetingFile: RegularFileProperty

    @get:OutputFile
    abstract val replyFile: RegularFileProperty

    @TaskAction
    fun execute() {
        val greetingText = greetingFile.get().asFile.readText()
        val replyText = StringBuilder(greetingText).appendLine().append("I fine , thx！")

        if (replyFile.asFile.get().exists().not()) {
            replyFile.asFile.get().createNewFile()
        }

        //ConfigurableFileCollection
        replyFile.asFile.get().writeText(replyText.toString())
    }
}

tasks.register<ReplyTask>("replyTask") {
    greetingFile.set(greetingTask.get().greetingFile)
    replyFile.set(layout.projectDirectory.file("reply.text").asFile)
}
```

(示例 7)

如上代码（示例 7）我们创建被注册了两个任务，generateGreetingTask 任务是向一个指定的文件中写入指定的问候语字符串。replyTask 任务是从指定的文件中读取字符串然后追加内容后写入到指定的文件中。

这个示例里我们关注两个关键点

**惰性配置** ReplyTask 中的输入和输出文件的实际设置是在配置阶段，在未真实设置之前我们可以通过延迟类型在 Action 中引用到它。类似的，也可以在文件名确认之前，把一个任务的输出文件链接到另一个任务的输入文件。

**任务依赖** 执行 replyTask 任务的时候，会发现 generateGreetingTask 任务先执行，然后执行 replyTask。原因是 replyTask 依赖 generateGreetingTask，这种依赖的形成就是依赖 Gradle 的自动推断。当一个任务的输出（文件类型）还另外一个任务的输出时候且此处的输入输出是是文件形式，Gradle 能够自动的构建任务依赖。 这种方式形成的任务依赖我们称之为隐形依赖。

## 5 增量构建、缓存配置

![Alt text](/images/gradle-task-cache.png)

### 5.1 增量构建是什么

```kotlin
/**
 * 8.增量测试
 * Disabling up-to-date checks
 */
//@UntrackedTask(because = "time should refresh") //【注释 1】 ，通过标注该注解。注明不UP-TO-DATE
abstract class LogTimeTask : DefaultTask() {
    init {
        //this.doNotTrackState("Instrumentation needs to re-run every time") //【注释 2】
    }
//   @get:Input
//   abstract val timeString: Property<String> //【注释 3】

    @get:OutputFile
    abstract val outTimeFile: RegularFileProperty

    @TaskAction
    fun execute() {
        outTimeFile.get().asFile.writeText(Date().time.toString())
    }
}

tasks.register<LogTimeTask>("logTime") {
    outTimeFile.set(layout.buildDirectory.file("log-time.txt"))
    //timeString.set(Date().time.toString())
}

// 输出
> Task :app:logTime UP-TO-DATE
```

（示例 8）

执行该 task 两次 会发现 UP-TO-DATE。而我们的本意是想每次执行的时候取当前时间写入到指定文件，UP-TO-DATE 意味着复用了上次输出的结果。出现这个现象的原因：Gradle 的 **增量构建(Incremental Build)**。

简单的说，增量构建就是 Gradle Task 输出和输出与上一次构建相比未发生变化的前提下，Gradle Task 复用上一次的构建输出结果。

回到我们刚刚的这个例子（示例 8），这个特性显然影响了我们每次都要执行的期望，解决的方式有两中，通过注释 1 或者注释 2 处在该 Task 范围内禁用增量构建特性；另一种，是把【变化的时间】这个一属性纳入到 Task 的观察范围内，把他标未 Input，如注释 3 处。

这里稍微展开下执行 Task 时的 LABLE 含义

- EXECUTE ：表明正常的执行了。
- UP-TO-DATE ：复用了上次构建结果。
- FROM-CACHE：复用了构建的缓存，下面章节（5.3）详细介绍。
- SKIPP：任务略过未执行。

### 5.2 增量构建怎么运行

**核心原理**

- 在一个任务执行之前会对该任务的输入计算指纹，参与指纹计算的元素包括输入的内容、输入的路径，输入文件的路径、输入文件的内容 hash 值。任务执行成功之后，会计算任务输出文件的指纹，类似地，参与输出文件的指纹计算的包括输出文件的路径，每个输出文件的内容 hash。
- 任务下次执行时，会计算当下输入、输出文件的指纹并与上次记录的指纹做对比，如果指纹相同则该任务还是“最新的”，无需重新执行。特别地，Gradle 在计算当下输入、输出的指纹时会先检测文件的状态（包括文件的大小、文件上次更改的时间、文件的权限等）是否发生了变化，如果无变化直接使用存储的指纹。

**重要秉性**

（https://docs.gradle.org/current/userguide/incremental_build.html#sec:how_does_it_work）

- **增量构建生效必须有 output**。
- 如果一个输入影响了输出，确保要把他标注为 input，否则会出现未更新的情况，尽管是是需要更新的。
- 相反，如果属性不影响输出，就不要将其注册为输入，否则任务可能会在不需要的时候执行。
- 还要注意那些可能为完全相同的输入生成不同输出的非确定性任务:这些任务不应该配置为增量构建，因为最新的检查将不起作用。

- 输出是一个文件夹，如果文件夹中添加了文件，该变化不会成为导致 Task 过期的条件。考虑到不相关的 task 可能共用一个输出文件夹。如果要打破该规则可使用（[TaskOutputs.upToDateWhen(groovy.lang.Closure)](https://docs.gradle.org/current/javadoc/org/gradle/api/tasks/TaskOutputs.html#upToDateWhen-groovy.lang.Closure-)）
- Gradle Task 的代码也会作为其 Inputs 的一部分，比如 actions 、依赖、group 发生了变化都会导致增量构建失效。
- Gradle 对文件顺序是敏感的，即使只是文件顺序发生了变化，也会导致增量构建的失效。比如一个代表 java classpath 的属性。

**精细化的增量**

作为输入的文件目录或者一组文件(InputFiles)，如果只是一部分发生了变化对应的影响到了一部分的输出，此时如果全量的执行该 Task 显然是不太经济的做法，Gradle 给我们提供了一种机制可以监听文件目录或者一组文件的具体变化，根据输入的变化执行部分的操作避免全量的执行。具体的做法

使用@Incremental 与 @InputFiles 或 @InputDirectory 一起使用，指示 Gradle 跟踪对带注释的文件属性的更改，因此可以通过@InputChanges.getFileChanges()查询更改。示例如下。

```kotlin
/**
 * 9. 自定义增量构建
 */
abstract class IncrementalTask : DefaultTask() {

    @get:Incremental
    @get:InputDirectory
    // 当normalized path 的时候会取到什么
    @get:PathSensitive(PathSensitivity.NAME_ONLY)
    abstract val inputDir: DirectoryProperty


    @get:OutputDirectory
    abstract val outputDir: DirectoryProperty

    @TaskAction
    fun execute(inputChange: InputChanges) {
        val msg = if (inputChange.isIncremental) {
            "CHANGED inputs are out of date"
        } else {
            "ALL inputs are out of date"
        }
        println(msg)
        inputChange.getFileChanges(inputDir).forEach { change ->
            // 1. 如果是目录直接返回
            if (change.fileType == FileType.DIRECTORY) {
                println("dir change~")
                return@forEach
            }

            // 2.找到要输出的文件
            val normalized = change.normalizedPath
            val normalizedFile = change.file
            println("normalized $normalized")
            println("changed file $normalizedFile")
            val targetFile = outputDir.file(normalized).get().asFile
            if (targetFile.parentFile.exists().not()) {
                targetFile.parentFile.mkdirs()
            }
            // 3.根据文件的变化处理输出
            when (change.changeType) {

                ChangeType.ADDED -> {
                    println("dir add targetFile ~$targetFile")
                    println("dir add change ~${change.file}")
                    targetFile.writeText(change.file.readText().reversed())
                }

                ChangeType.REMOVED -> {
                    println("dir remove~")
                    targetFile.delete()
                }

                ChangeType.MODIFIED -> {
                    println("dir modified~")
                    targetFile.writeText(change.file.readText().reversed())
                }
            }
        }
    }
}
```

（示例 9）

示例中对该特性主要 api 做了详细的示例，其中 [@PathSensitive](https://docs.gradle.org/current/javadoc/org/gradle/api/tasks/PathSensitive.html)，标记 task 的文件属性用来告诉 Gradle 在增量构建或者构建缓存时应该把哪一部分纳入到检查范围内。

### 5.3 构建缓存（Build Cache）

与增量构建类似，构建缓存也能提升我们构建的效率，两者最大的不同在于复用的范围。增量构建 **只能复用同一工作区内上次的构建输出**，而构建缓存可以复用先前的存放在本机任意位置的构建输出，甚至还可以在不同开发者之间不同开发机之间共用缓存。

回到我们本文的主题，来看看如何让我们的自定义的 Task 支持构建缓存。标记 @CacheableTask 注解，默认情况下继承 DefaultTask 实现的 Task 并不支持构建缓存。一些内置任务如 Copy Task 也是不支持构建缓存的。

```kotlin
/**
 * 9. 构建缓存
 */
@CacheableTask
abstract class PrintHelloCoffee : DefaultTask() {
    init {
        group = "build  cache"
    }

    @get:OutputFile
    abstract val coffeeDes: RegularFileProperty

    @TaskAction
    fun execute() {
        coffeeDes.get().asFile.writeText("hello world !")
    }
}
tasks.register<PrintHelloCoffee>("buildCache") {
    coffeeDes.set(layout.buildDirectory.file("coffee.txt"))
}

```

(示例 9)

执行 buildCache （`gradlew --build-cache :app:BuildCache`）任务，删除构建目录下的 coffee.txt 文件，再次执行`gradlew --build-cache :app:BuildCache` 就看到输出了`> Task :app:buildCache FROM-CACHE` 说明构建缓存生效了。除了使用--build-cache 选项这种方式让任务的构建缓存生效外，还可以在 gradle.properties 文件中添加 org.gradle.caching=true 行让全局的任务执行构建缓存生效。

如上代码该自定义的 Task 是支持构建缓存的。默认的缓存的产物存在的位置是在 GradleUserHome 下，我们也可以配置构建缓存该目录。配置构建缓存在 settings 脚本中设置。如下

```kotlin
// settings.gradle.kts
buildscript {
    buildCache {
        local {
            directory = File(rootDir, "build-cache") //设置构建缓存的目录
        }
    }
}
```

如上示例是设置了构建缓存的本地目录，也就是说构建缓存存储在本地什么位置。除了把缓存产物存储在本地也可以把缓存设置在远端，达到不同机器之间共享构建缓存。

增量构建和构建缓存在提升 Gradle 构建性能中占了举足轻重的作用。

## 6 总结

通过本文对 Gradle Task 的使用和编写有了较为全面的认识，包括 Task 的基本属性的设置、Gradle Task 的依赖和任务排序，还有 Gradle Task 的增量构建和构建缓存的运行原理。
