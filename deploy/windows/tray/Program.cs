using System;
using System.ComponentModel;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.ServiceProcess;
using System.Text.Json;
using System.Threading;
using System.Windows.Forms;
using System.Xml.Linq;

namespace TheStorehouseTray;

internal static class Program
{
  [STAThread]
  private static void Main()
  {
    using var mutex = new Mutex(true, "Local\\TheStorehouseTray", out var isNew);
    if (!isNew)
    {
      return;
    }

    Application.EnableVisualStyles();
    Application.SetCompatibleTextRenderingDefault(false);
    Application.Run(new TrayAppContext());
    GC.KeepAlive(mutex);
  }
}

internal sealed class TrayAppContext : ApplicationContext
{
  private const string AppName = "The Storehouse";
  private const string ServiceName = "TheStorehouse";
  private const int DefaultPort = 3040;

  private readonly NotifyIcon _trayIcon;
  private readonly ToolStripMenuItem _statusItem;
  private readonly ToolStripMenuItem _openItem;
  private readonly ToolStripMenuItem _startItem;
  private readonly ToolStripMenuItem _stopItem;
  private readonly ToolStripMenuItem _quitItem;

  public TrayAppContext()
  {
    _statusItem = new ToolStripMenuItem("Service: unknown") { Enabled = false };
    _openItem = new ToolStripMenuItem("Open The Storehouse", null, OnOpen);
    _startItem = new ToolStripMenuItem("Start Service", null, OnStart);
    _stopItem = new ToolStripMenuItem("Stop Service", null, OnStop);
    _quitItem = new ToolStripMenuItem("Quit (Stop Service)", null, OnQuit);

    var menu = new ContextMenuStrip();
    menu.Opening += OnMenuOpening;
    menu.Items.AddRange(new ToolStripItem[]
    {
      _statusItem,
      new ToolStripSeparator(),
      _openItem,
      new ToolStripSeparator(),
      _startItem,
      _stopItem,
      new ToolStripSeparator(),
      _quitItem
    });

    _trayIcon = new NotifyIcon
    {
      Icon = LoadIcon(),
      Text = AppName,
      Visible = true,
      ContextMenuStrip = menu
    };

    _trayIcon.DoubleClick += OnOpen;
  }

  protected override void Dispose(bool disposing)
  {
    if (disposing)
    {
      _trayIcon.Visible = false;
      _trayIcon.Dispose();
    }

    base.Dispose(disposing);
  }

  private void OnMenuOpening(object? sender, CancelEventArgs e)
  {
    if (TryGetServiceStatus(out var status))
    {
      _statusItem.Text = $"Service: {status}";
      _startItem.Enabled = status is ServiceControllerStatus.Stopped or ServiceControllerStatus.Paused;
      _stopItem.Enabled = status is ServiceControllerStatus.Running or ServiceControllerStatus.Paused;
    }
    else
    {
      _statusItem.Text = "Service: not installed";
      _startItem.Enabled = false;
      _stopItem.Enabled = false;
    }
  }

  private void OnOpen(object? sender, EventArgs e)
  {
    var url = BuildLocalUrl();
    try
    {
      Process.Start(new ProcessStartInfo
      {
        FileName = url,
        UseShellExecute = true
      });
    }
    catch (Exception ex)
    {
      ShowError($"Could not open browser. {ex.Message}");
    }
  }

  private void OnStart(object? sender, EventArgs e)
  {
    if (StartService())
    {
      ShowInfo("Service started.");
    }
  }

  private void OnStop(object? sender, EventArgs e)
  {
    if (StopService())
    {
      ShowInfo("Service stopped.");
    }
  }

  private void OnQuit(object? sender, EventArgs e)
  {
    StopService();
    ExitThread();
  }

  private static bool TryGetServiceStatus(out ServiceControllerStatus status)
  {
    try
    {
      using var controller = new ServiceController(ServiceName);
      status = controller.Status;
      return true;
    }
    catch
    {
      status = ServiceControllerStatus.Stopped;
      return false;
    }
  }

  private bool StartService()
  {
    if (TryStartWithController())
    {
      return true;
    }

    if (TryRunServiceCommandAsAdmin("start") && WaitForStatus(ServiceControllerStatus.Running))
    {
      return true;
    }

    ShowError("Start failed. You may need to run as Administrator.");
    return false;
  }

  private bool StopService()
  {
    if (TryStopWithController())
    {
      return true;
    }

    if (TryRunServiceCommandAsAdmin("stop") && WaitForStatus(ServiceControllerStatus.Stopped))
    {
      return true;
    }

    ShowError("Stop failed. You may need to run as Administrator.");
    return false;
  }

  private static bool TryStartWithController()
  {
    try
    {
      using var controller = new ServiceController(ServiceName);
      if (controller.Status == ServiceControllerStatus.Running)
      {
        return true;
      }

      controller.Start();
      controller.WaitForStatus(ServiceControllerStatus.Running, TimeSpan.FromSeconds(12));
      return controller.Status == ServiceControllerStatus.Running;
    }
    catch
    {
      return false;
    }
  }

  private static bool TryStopWithController()
  {
    try
    {
      using var controller = new ServiceController(ServiceName);
      if (controller.Status == ServiceControllerStatus.Stopped)
      {
        return true;
      }

      controller.Stop();
      controller.WaitForStatus(ServiceControllerStatus.Stopped, TimeSpan.FromSeconds(12));
      return controller.Status == ServiceControllerStatus.Stopped;
    }
    catch
    {
      return false;
    }
  }

  private static bool TryRunServiceCommandAsAdmin(string command)
  {
    var exePath = ResolveServiceExePath();
    if (string.IsNullOrWhiteSpace(exePath) || !File.Exists(exePath))
    {
      return false;
    }

    try
    {
      var process = Process.Start(new ProcessStartInfo
      {
        FileName = exePath,
        Arguments = command,
        UseShellExecute = true,
        Verb = "runas"
      });
      process?.WaitForExit(15000);
      return true;
    }
    catch
    {
      return false;
    }
  }

  private static bool WaitForStatus(ServiceControllerStatus targetStatus)
  {
    var deadline = DateTime.UtcNow.AddSeconds(12);
    while (DateTime.UtcNow < deadline)
    {
      if (TryGetServiceStatus(out var status) && status == targetStatus)
      {
        return true;
      }

      System.Threading.Thread.Sleep(500);
    }

    return false;
  }

  private void ShowInfo(string message)
  {
    _trayIcon.BalloonTipTitle = AppName;
    _trayIcon.BalloonTipText = message;
    _trayIcon.ShowBalloonTip(2500);
  }

  private void ShowError(string message)
  {
    _trayIcon.BalloonTipTitle = AppName;
    _trayIcon.BalloonTipText = message;
    _trayIcon.ShowBalloonTip(3500);
  }

  private static string BuildLocalUrl()
  {
    var port = ResolvePort();
    return $"http://localhost:{port}";
  }

  private static int ResolvePort()
  {
    var port = ReadPortFromServiceXml();
    if (port.HasValue)
    {
      return port.Value;
    }

    port = ReadPortFromConfig();
    return port ?? DefaultPort;
  }

  private static int? ReadPortFromServiceXml()
  {
    try
    {
      var baseDir = AppContext.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar);
      var rootDir = Directory.GetParent(baseDir)?.FullName;
      if (string.IsNullOrWhiteSpace(rootDir))
      {
        return null;
      }

      var xmlPath = Path.Combine(rootDir, "service", "TheStorehouseService.xml");
      if (!File.Exists(xmlPath))
      {
        return null;
      }

      var doc = XDocument.Load(xmlPath);
      foreach (var env in doc.Descendants("env"))
      {
        var name = env.Attribute("name")?.Value;
        if (!string.Equals(name, "PORT", StringComparison.OrdinalIgnoreCase))
        {
          continue;
        }

        var value = env.Attribute("value")?.Value;
        if (int.TryParse(value, out var port) && port is > 0 and < 65536)
        {
          return port;
        }
      }
    }
    catch
    {
      return null;
    }

    return null;
  }

  private static int? ReadPortFromConfig()
  {
    try
    {
      var programData = Environment.GetEnvironmentVariable("ProgramData");
      if (string.IsNullOrWhiteSpace(programData))
      {
        programData = @"C:\ProgramData";
      }

      var configPath = Path.Combine(programData, "The Storehouse", "config", "config.json");
      if (!File.Exists(configPath))
      {
        return null;
      }

      using var stream = File.OpenRead(configPath);
      using var doc = JsonDocument.Parse(stream);
      if (doc.RootElement.TryGetProperty("port", out var portElement) &&
          portElement.TryGetInt32(out var port) &&
          port is > 0 and < 65536)
      {
        return port;
      }
    }
    catch
    {
      return null;
    }

    return null;
  }

  private static string? ResolveServiceExePath()
  {
    try
    {
      var baseDir = AppContext.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar);
      var rootDir = Directory.GetParent(baseDir)?.FullName;
      if (string.IsNullOrWhiteSpace(rootDir))
      {
        return null;
      }

      return Path.Combine(rootDir, "service", "TheStorehouseService.exe");
    }
    catch
    {
      return null;
    }
  }

  private static Icon LoadIcon()
  {
    try
    {
      var asm = typeof(TrayAppContext).Assembly;
      var name = "TheStorehouseTray.assets.TheStorehouse.ico";
      using var stream = asm.GetManifestResourceStream(name);
      if (stream == null)
      {
        return SystemIcons.Application;
      }
      return new Icon(stream);
    }
    catch
    {
      return SystemIcons.Application;
    }
  }
}
